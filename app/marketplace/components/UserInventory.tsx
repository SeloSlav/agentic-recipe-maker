import React, { useMemo, useRef } from 'react';
import { UserInventoryItem, Rarity } from '../types';
import Image from 'next/image';
import { Timestamp } from '../../lib/backend/database';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

interface UserInventoryProps {
    items: UserInventoryItem[];
}

const getRarityColor = (rarity: Rarity): string => {
    switch (rarity) {
        case 'common':
            return 'bg-gray-100 text-gray-600';
        case 'uncommon':
            return 'bg-green-100 text-green-600';
        case 'rare':
            return 'bg-blue-100 text-blue-600';
        case 'epic':
            return 'bg-purple-100 text-purple-600';
        case 'legendary':
            return 'bg-yellow-100 text-yellow-600';
    }
};

export const UserInventory: React.FC<UserInventoryProps> = ({ items }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            const dateA = a.purchasedAt instanceof Timestamp ?
                a.purchasedAt.toDate().getTime() :
                a.purchasedAt.getTime();
            const dateB = b.purchasedAt instanceof Timestamp ?
                b.purchasedAt.toDate().getTime() :
                b.purchasedAt.getTime();
            return dateB - dateA;
        });
    }, [items]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 300; // Adjust this value to control scroll distance
            const newScrollPosition = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
            scrollContainerRef.current.scrollTo({
                left: newScrollPosition,
                behavior: 'smooth'
            });
        }
    };

    if (items.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
                <p className="text-gray-500">No discount codes yet. Earn spoons and redeem them above!</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="mt-4 flex-1 relative group">
                {/* Left Arrow */}
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black bg-opacity-20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-opacity-30"
                    aria-label="Scroll left"
                >
                    <FontAwesomeIcon icon={faChevronLeft} />
                </button>

                {/* Right Arrow */}
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black bg-opacity-20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-opacity-30"
                    aria-label="Scroll right"
                >
                    <FontAwesomeIcon icon={faChevronRight} />
                </button>

                <div className="bg-white rounded-3xl border border-gray-300 p-6">
                    <div
                        ref={scrollContainerRef}
                        className="flex overflow-x-auto pb-4 custom-scrollbar gap-4 snap-x snap-mandatory"
                    >
                        {sortedItems.map((item) => {
                            const purchaseDate = item.purchasedAt instanceof Timestamp ?
                                item.purchasedAt.toDate() :
                                item.purchasedAt;

                            return (
                                <div
                                    key={`${item.id}-${purchaseDate.getTime()}`}
                                    className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow flex-shrink-0 w-[280px] snap-start"
                                >
                                    <div className="flex flex-col">
                                        <div className="relative h-40 w-full">
                                            <Image
                                                src={item.imageUrl}
                                                alt={item.name}
                                                fill
                                                className="object-cover"
                                                onError={(e) => {
                                                    const imgElement = e.target as HTMLImageElement;
                                                    const parent = imgElement.parentElement;
                                                    if (parent) {
                                                        parent.classList.add('bg-gray-100', 'flex', 'items-center', 'justify-center');
                                                        parent.innerHTML = `
                                                            <div class="text-gray-400 text-center">
                                                                <div class="text-2xl">🎁</div>
                                                            </div>
                                                        `;
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="p-4">
                                            <div className="mb-2">
                                                <h3 className="font-semibold mb-2">{item.name}</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getRarityColor(item.rarity)}`}>
                                                        {item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}
                                                    </span>
                                                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-600">
                                                        Discount Code
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};