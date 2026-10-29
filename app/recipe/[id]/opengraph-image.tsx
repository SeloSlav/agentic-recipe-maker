import { ImageResponse } from 'next/og';
import { doc, getDoc } from '../../lib/backend/database';
import { db } from "../../lib/backend/client";

export const runtime = 'edge';
export const alt = 'Recipe Image';
export const size = {
  width: 1200,
  height: 630,
};

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    const recipeDoc = await getDoc(doc(db, "recipes", id));
    const recipe = recipeDoc.exists() ? recipeDoc.data() : null;

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            background: '#fff',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <img
            src={recipe?.imageURL || "https://www.babaselo.com/baba-removebg.png"}
            alt={recipe?.recipeTitle || "Baba Selo Recipe"}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )
    );
  } catch (error) {
    console.error('Error generating OpenGraph image:', error);
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            background: '#fff',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <img
            src="https://www.babaselo.com/baba-removebg.png"
            alt="Baba Selo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )
    );
  }
}