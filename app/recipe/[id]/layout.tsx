import { Metadata } from 'next';
import { doc, getDoc } from '../../lib/backend/database';
import { db } from "../../lib/backend/client";
import { RecipeSchema } from './RecipeSchema';

type Props = {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  try {
    const { id } = await props.params;
    const recipeDoc = await getDoc(doc(db, "recipes", id));
    const recipe = recipeDoc.exists() ? recipeDoc.data() : null;

    // Default values (SEO: AI Recipe Generator keyword)
    const defaultTitle = "Recipe | AI Recipe Generator | Baba Selo";
    const defaultDescription = "AI Recipe Generator - Discover and save delicious recipes created with Baba Selo's AI assistant.";
    const defaultImage = "https://www.babaselo.com/baba-removebg.png";

    if (!recipe) {
      return {
        metadataBase: new URL('https://www.babaselo.com'),
        title: defaultTitle,
        description: defaultDescription,
        openGraph: {
          title: defaultTitle,
          description: defaultDescription,
          images: [defaultImage],
        },
        twitter: {
          card: 'summary_large_image',
          title: defaultTitle,
          description: defaultDescription,
          images: [defaultImage],
        },
      };
    }

    const title = `${recipe.recipeTitle} | Baba Selo`;
    const description = recipe.recipeSummary || `A delicious ${recipe.cuisineType} recipe for ${recipe.recipeTitle}. Create and save with AI Recipe Generator | Baba Selo.`;
    const image = recipe.imageURL || defaultImage;
    const canonicalUrl = `https://www.babaselo.com/recipe/${id}`;

    return {
      metadataBase: new URL('https://www.babaselo.com'),
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        images: [image],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image],
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      metadataBase: new URL('https://www.babaselo.com'),
      title: 'Recipe | AI Recipe Generator | Baba Selo',
      description: 'AI Recipe Generator - Discover and save delicious recipes with Baba Selo.',
    };
  }
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="recipe-layout">
      <RecipeSchema recipeId={id} />
      {children}
    </div>
  );
}
