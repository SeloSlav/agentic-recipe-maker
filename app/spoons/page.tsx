"use client";

import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpoon, faChevronDown, faChevronUp, faLightbulb, faTrophy, faGear, faInfoCircle, faXmark, faStar } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } from '../lib/backend/database';
import { db } from "../lib/backend/client";
import Link from 'next/link';
import { format } from 'date-fns';
import { Timestamp } from '../lib/backend/database';
import { POINT_ACTIONS } from '../lib/spoonPoints';
import { PointsHistory } from './components/PointsHistory';
import { usePoints } from '../context/PointsContext';
import { LeaderboardList } from './components/LeaderboardList';
import { SidebarLayout } from '../components/SidebarLayout';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface PointTransaction {
  actionType: string;
  points: number;
  timestamp: Timestamp;
  details?: string;
  targetId?: string;
}

interface UserSpoonData {
  totalPoints: number;
  transactions: PointTransaction[];
  username: string;
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  totalPoints: number;
}

const SpoonStats = () => {
  const { user } = useAuth();
  const [userData, setUserData] = useState<UserSpoonData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // Function to fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      // Query top 25 users by total points
      const leaderboardQuery = query(
        collection(db, 'spoonPoints'),
        orderBy('totalPoints', 'desc'),
        limit(25)
      );
      const leaderboardDocs = await getDocs(leaderboardQuery);

      // Get all user documents for additional user data
      const userDocs = await Promise.all(
        leaderboardDocs.docs.map(async (doc) => {
          const userRef = doc.ref;
          const userDoc = await getDoc(userRef);
          return {
            spoonData: doc.data(),
            userData: userDoc.exists() ? userDoc.data() : null,
            id: doc.id
          };
        })
      );

      // Map the data to our leaderboard format
      const leaderboardData = userDocs.map(({ spoonData, userData, id }) => ({
        userId: id,
        username: spoonData.username || userData?.username || 'Anonymous Chef',
        totalPoints: spoonData.totalPoints || 0,
      }));

      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const userSpoonRef = doc(db, 'spoonPoints', user.uid);
        const userSpoonDoc = await getDoc(userSpoonRef);

        if (!userSpoonDoc.exists()) {
          const initialData = {
            totalPoints: 0,
            transactions: [],
            username: 'Anonymous Chef'
          };
          await setDoc(userSpoonRef, initialData);
          setUserData(initialData);
        } else {
          setUserData(userSpoonDoc.data() as UserSpoonData);
        }

        await fetchLeaderboard();
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching spoon stats:', error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  if (isLoading) {
    return (
      <SidebarLayout>
      <div className="flex flex-col items-center justify-center min-h-screen">
        <img src="/baba-removebg.png" alt="Baba" className="w-32 h-32 mb-6" />
        <div className="typing-indicator flex space-x-2">
          <div className="dot rounded-full w-6 h-6"></div>
          <div className="dot rounded-full w-6 h-6"></div>
          <div className="dot rounded-full w-6 h-6"></div>
        </div>
      </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Add Baba Selo logo and title */}
      <div className="flex flex-col items-center mb-12">
        <img src="/baba-removebg.png" alt="Baba" className="w-32 h-32 mb-4" />
        <h1 className="text-center text-2xl font-semibold mb-4">
          Let's see how many points you've earned, dear!
        </h1>
        <div className="flex items-center gap-2">
        <p className="text-amber-900/70">Track your cooking achievements</p>
        <button
            onClick={() => setIsInfoModalOpen(true)}
            className="text-amber-600/70 hover:text-amber-700 transition-colors"
            title="Learn about spoon points"
          >
            <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Header with total points */}
      <div className="bg-white rounded-3xl shadow-lg border border-amber-100 p-6 mb-8 shadow-amber-900/5">
        {userData?.totalPoints ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="bg-amber-100 p-4 rounded-full mr-4">
                <FontAwesomeIcon icon={faSpoon} className="text-2xl text-amber-600" />
              </div>
              <h1 className="text-xl md:text-3xl font-bold">Your Spoon Stats</h1>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-amber-600">{userData.totalPoints}</div>
              <div className="text-amber-900/70">Total Spoons Earned</div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-2xl font-bold mb-4">No Points Yet!</div>
            <p className="text-amber-900/70 mb-6">Time to start your cooking journey with Baba!</p>
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 bg-amber-600 text-white rounded-full hover:bg-amber-700 transition-colors"
            >
              <span className="mr-2">✨</span>
              Start by Generating a Recipe
            </Link>
          </div>
        )}
      </div>
      {/* Leaderboard section */}
      <LeaderboardList leaderboard={leaderboard} currentUserId={user?.uid}/>

      {/* Points History */}
      {userData && (
        <PointsHistory transactions={userData.transactions} />
      )}

      {/* Info Modal */}
      {isInfoModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setIsInfoModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl max-w-2xl w-full max-h-[80vh] relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-amber-100">
              <h2 className="text-xl font-bold text-gray-900">How Do Spoon Points Work?</h2>
              <button
                onClick={() => setIsInfoModalOpen(false)}
                className="text-amber-800/70 hover:text-amber-900 transition-colors"
              >
                <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(80vh - 140px)' }}>
              <div className="space-y-6">
                <p>
                  <span className="font-semibold">Spoon Points</span> are your cooking achievement score!
                  Earn them by interacting with Baba Selo and building your recipe collection.
                </p>

                <div className="bg-amber-50 rounded-lg p-4 sm:p-6 space-y-4 border border-amber-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-100 p-3 rounded-full flex-shrink-0">
                      <FontAwesomeIcon icon={faSpoon} className="text-amber-600 w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-amber-900 text-lg">Ways to earn points</h3>
                  </div>
                  <div className="grid gap-2">
                    {[
                      { action: "Generating new recipes", points: "5", emoji: "✨" },
                      { action: "Generating recipe summaries", points: "15", emoji: "📝" },
                      { action: "Getting calorie and nutritional information", points: "20", emoji: "📊" },
                      { action: "Discovering perfect dish pairings", points: "15", emoji: "🍷" },
                      { action: "Generating AI recipe images", points: "10", emoji: "🎨" },
                      { action: "Uploading your own recipe photos", points: "25-100", note: "(for authentic food photos)", emoji: "📸" },
                      { action: "Chatting with Baba about your recipe", points: "5", note: "(per meaningful interaction)", emoji: "💬" },
                      { action: "Having others like your shared recipes", points: "10", note: "(per like)", emoji: "❤️" }
                    ].map((item, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[2rem_1fr_auto] items-start bg-white p-3 rounded-lg hover:bg-yellow-50 transition-all duration-200 border border-yellow-100 gap-3"
                      >
                        <span className="text-xl" role="img" aria-label={item.action}>
                          {item.emoji}
                        </span>
                        <div className="min-w-0">
                          <div className="text-yellow-900 break-words">
                            {item.action}
                          </div>
                          {item.note &&
                            <div className="text-sm text-yellow-600">
                              {item.note}
                            </div>
                          }
                        </div>
                        <div className="font-medium text-yellow-700 flex items-center gap-2 bg-yellow-100 px-3 py-1 rounded-full whitespace-nowrap">
                          <FontAwesomeIcon icon={faSpoon} className="w-3 h-3" />
                          {item.points}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="font-semibold text-yellow-800">🌟 Pro tips:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-yellow-800">
                    <li>Completing all recipe sections in one session earns bonus points!</li>
                    <li>Regular interactions with Baba unlock special achievements</li>
                    <li>Try asking Baba about traditional cooking techniques</li>
                    <li>Share your recipes to earn points from the community</li>
                  </ul>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="font-semibold text-blue-800">⚡ Important Notes:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-blue-800">
                    <li>Each activity has hourly and daily limits - experiment to discover them!</li>
                    <li>Submitting the same recipes repeatedly won't earn points - get creative!</li>
                    <li>Points are awarded for meaningful interactions, not repetitive actions</li>
                    <li>The more unique and diverse your contributions, the more points you can earn</li>
                  </ul>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <p className="font-semibold text-green-800">🎁 Coming Soon:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-green-800">
                    <li>Exclusive discounts on SELO olive oil and partnering brands</li>
                    <li>Special rewards and free product giveaways</li>
                    <li>Seasonal cooking contests with exciting prizes</li>
                    <li>Early access to new Baba Selo features</li>
                  </ul>
                  <p className="mt-2 text-sm text-green-700 italic">Baba Selo is currently finalizing these exciting rewards - keep earning those points!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </SidebarLayout>
  );
};

export default SpoonStats;