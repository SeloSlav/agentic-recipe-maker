import React from 'react';
import Link from 'next/link';
import type { NutritionalInfo, RecipeLink } from './types';

export const renderMarkdown = (text: string): React.ReactNode => {
    // First handle images with markdown syntax ![alt](url)
    const parts = text.split(/(!?\[.*?\]\(.*?\))/);
    
    return parts.map((part, index) => {
        // Check if this part is an image markdown
        if (part.match(/^!\[.*?\]\(.*?\)$/)) {
            const [, alt, url] = part.match(/^!\[(.*?)\]\((.*?)\)$/) || [];
            return (
                <div key={index} className="my-4">
                    <img 
                        src={url} 
                        alt={alt} 
                        className="rounded-xl max-w-full h-auto shadow-lg"
                        loading="lazy"
                    />
                </div>
            );
        }
        // Check if this part is a markdown link [text](url)
        const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
        if (linkMatch) {
            const [, linkText, href] = linkMatch;
            const isInternal = href.startsWith('/');
            if (isInternal) {
                return (
                    <Link key={index} href={href} className="text-amber-700 hover:text-amber-800 font-medium underline">
                        {linkText}
                    </Link>
                );
            }
            return (
                <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:text-amber-800 font-medium underline">
                    {linkText}
                </a>
            );
        }
        
        // Handle regular bold text for the remaining parts
        const boldParts = part.split(/(\*\*.*?\*\*)/);
        return boldParts.map((boldPart, boldIndex) => {
            if (boldPart.startsWith("**") && boldPart.endsWith("**")) {
                const trimmedPart = boldPart.slice(2, -2).trim();
                const nextPart = boldParts[boldIndex + 1] || "";
                const endsWithPunctuation = nextPart.startsWith(".") || nextPart.startsWith(",") || nextPart.startsWith("!");

                return (
                    <React.Fragment key={`${index}-${boldIndex}`}>
                        {boldIndex > 0 && !boldParts[boldIndex - 1].endsWith(" ") && " "}
                        <strong className="font-semibold">{trimmedPart}</strong>
                        {boldIndex < boldParts.length - 1 && !endsWithPunctuation && !nextPart.startsWith(" ") && " "}
                    </React.Fragment>
                );
            }
            return boldPart;
        });
    });
};

export const renderNutritionInfo = (macros: NutritionalInfo) => {
    if (!macros || !macros.total || !macros.per_serving) {
        return <div>No macro information available.</div>;
    }

    return (
        <div className="p-4 bg-gray-50 rounded-lg shadow border border-gray-300">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Nutritional Breakdown</h3>
            
            {macros.servings && (
                <div className="mb-4 text-sm text-gray-600">
                    <p className="font-semibold">Number of Servings: {macros.servings}</p>
                </div>
            )}

            {/* Total Recipe */}
            <div className="mb-4">
                <h4 className="text-md font-semibold text-gray-700 mb-2">Total Recipe</h4>
                <div className="space-y-1 text-sm text-gray-600">
                    <p className="flex justify-between">
                        <span>Calories:</span>
                        <span className="font-medium">{macros.total.calories} kcal</span>
                    </p>
                    <p className="flex justify-between">
                        <span>Proteins:</span>
                        <span className="font-medium">{macros.total.proteins} g</span>
                    </p>
                    <p className="flex justify-between">
                        <span>Carbohydrates:</span>
                        <span className="font-medium">{macros.total.carbs} g</span>
                    </p>
                    <p className="flex justify-between">
                        <span>Fats:</span>
                        <span className="font-medium">{macros.total.fats} g</span>
                    </p>
                </div>
            </div>

            {/* Per Serving */}
            <div>
                <h4 className="text-md font-semibold text-gray-700 mb-2">Per Serving</h4>
                <div className="space-y-1 text-sm text-gray-600">
                    <p className="flex justify-between">
                        <span>Calories:</span>
                        <span className="font-medium">{macros.per_serving.calories} kcal</span>
                    </p>
                    <p className="flex justify-between">
                        <span>Proteins:</span>
                        <span className="font-medium">{macros.per_serving.proteins} g</span>
                    </p>
                    <p className="flex justify-between">
                        <span>Carbohydrates:</span>
                        <span className="font-medium">{macros.per_serving.carbs} g</span>
                    </p>
                    <p className="flex justify-between">
                        <span>Fats:</span>
                        <span className="font-medium">{macros.per_serving.fats} g</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export const renderDiscountButton = () => (
    <div className="mt-4">
        <a
            href="https://seloolive.com/discount/BABASELO10?redirect=/products/authentic-croatian-olive-oil?variant=40790542549035"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center px-5 py-3 bg-gradient-to-r from-teal-600 to-teal-500 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
        >
            <span className="relative z-10 flex flex-col items-start">
                <span className="font-semibold">Get 10% Off Selo Olive Oil</span>
                <span className="text-xs text-teal-100 mt-0.5">Authentic Croatian • Cold-Pressed</span>
            </span>
            <span className="ml-3 group-hover:translate-x-1 transition-transform duration-300">→</span>
        </a>
    </div>
);

export const linkifyLastSelo = (text: string): React.ReactNode => {
    const target = "selo olive oil";
    const lower = text.toLowerCase();
    const lastIndex = lower.lastIndexOf(target);

    if (lastIndex === -1) return text;

    return (
        <>
            {text.substring(0, lastIndex)}
            <a
                href="https://seloolive.com/products/authentic-croatian-olive-oil?variant=40790542549035"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
            >
                {text.substring(lastIndex, lastIndex + target.length)}
            </a>
            {text.substring(lastIndex + target.length)}
        </>
    );
};

export { type RecipeLink } from './types';

export const renderDishPairingLinks = (
    text: string,
    onSuggestionClick: (suggestion: string) => void,
    recipeLinks?: RecipeLink[]
): React.ReactNode => {
    const linkMap = new Map<string, RecipeLink>();
    if (recipeLinks) {
        for (const link of recipeLinks) {
            linkMap.set(link.name.toLowerCase().trim(), link);
        }
    }

    const boldRegex = /[*_]{2}(.*?)[*_]{2}/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const boldText = match[1];
        const link = linkMap.get(boldText.toLowerCase().trim());

        if (link) {
            parts.push(
                <Link
                    key={match.index}
                    href={`/recipe/${link.recipeId}`}
                    className="text-amber-700 hover:text-amber-800 font-medium underline"
                >
                    {boldText}
                </Link>
            );
        } else {
            parts.push(
                <button
                    key={match.index}
                    onClick={() => onSuggestionClick(`Give me a recipe for ${boldText}`)}
                    className="text-amber-700 hover:text-amber-800 font-medium underline cursor-pointer"
                >
                    {boldText}
                </button>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return <>{parts}</>;
};

export const linkifyOliveOil = (text: string): React.ReactNode => {
    const target = "olive oil";
    const lower = text.toLowerCase();
    const index = lower.indexOf(target);
    if (index === -1) return text;

    return (
        <>
            {text.substring(0, index)}
            <a
                href="https://seloolive.com/products/authentic-croatian-olive-oil?variant=40790542549035"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
            >
                {text.substring(index, index + target.length)}
            </a>
            {text.substring(index + target.length)}
        </>
    );
};

export const parseRecipe = (text: string) => {
    const raw = text.trim();
    const lower = raw.toLowerCase();
    const ingPos = lower.indexOf("ingredients");
    const dirPos = lower.indexOf("directions");

    if (ingPos === -1 || dirPos === -1 || dirPos <= ingPos) {
        return { title: raw.split("\n")[0]?.trim() || "Recipe", ingredients: [], directions: [] };
    }

    const ingredientsBlock = raw.slice(ingPos + 11, dirPos).trim();
    const directionsBlock = raw.slice(dirPos + 10).trim();

    const ingredients: string[] = [];
    const ingLines = ingredientsBlock.split("\n");
    for (const line of ingLines) {
        const parts = line.split(/(?=\s*[-•*]\s+)/);
        for (const p of parts) {
            const cleaned = p.replace(/^[\s\-•*]+\s*/, "").trim();
            if (cleaned && !cleaned.toLowerCase().startsWith("equipment") && cleaned.length > 2) {
                ingredients.push(cleaned);
            }
        }
    }

    const directions: string[] = [];
    for (const line of directionsBlock.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const cleaned = trimmed.replace(/^\d+[\.\)]\s*/, "").replace(/^[\-•*]\s*/, "").trim();
        if (cleaned && !cleaned.toLowerCase().startsWith("ah,") && !cleaned.toLowerCase().startsWith("na zdravlje")) {
            directions.push(cleaned);
        }
    }

    const beforeIng = raw.slice(0, ingPos);
    const titleMatch = beforeIng.match(/([A-Za-z][^:\n]+(?:\([^)]+\))?)\s*Ingredients?/i)
        || beforeIng.match(/(?:^|[:.\n])\s*([^\n:]+?)\s*$/);
    let title = (titleMatch ? titleMatch[1].trim() : beforeIng.split("\n").pop()?.trim() || raw.split("\n")[0]?.trim() || "Recipe");
    title = title.replace(/^Ah,?\s+[\w\s!.,]+:\s*/i, "").replace(/\s+Ingredients?\s*:?\s*$/i, "").trim();

    return { title: title || "Recipe", ingredients, directions };
};

export const isRecipe = (text: unknown): text is string => {
    return (
        typeof text === "string" &&
        text.toLowerCase().includes("ingredients") &&
        text.toLowerCase().includes("directions")
    );
}; 