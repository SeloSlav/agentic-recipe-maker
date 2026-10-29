import { lazyOpenAI } from '../../lib/openai-client';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { collection, getDocs, query, where } from '../../lib/backend/database';
import { db } from "../../lib/backend/client";

const openai = lazyOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const { category, rarity } = await req.json();

        // Get example items of the same category and rarity
        const goodiesRef = collection(db, 'goodies');
        const q = query(
            goodiesRef,
            where('category', '==', category),
            where('rarity', '==', rarity)
        );
        const similarItems = await getDocs(q);

        // Get all items to check for existing names
        const allItems = await getDocs(collection(db, 'goodies'));
        const existingNames = allItems.docs.map(doc => doc.data().name).join(', ');

        // Get some examples of the same rarity but different category as backup
        const qRarity = query(
            goodiesRef,
            where('rarity', '==', rarity)
        );
        const rarityItems = await getDocs(qRarity);

        // Format examples for the prompt
        const examples = similarItems.docs.map(doc => {
            const data = doc.data();
            return `Style reference ${data.category} item (${data.rarity}):
Name: ${data.name}
Description: ${data.description}
Cost: ${data.cost} spoons
`;
        }).join('\n');

        // Add some examples of same rarity if we don't have enough category examples
        const rarityExamples = similarItems.docs.length < 2 ?
            rarityItems.docs
                .filter(doc => doc.data().category !== category)
                .slice(0, 2)
                .map(doc => {
                    const data = doc.data();
                    return `Style reference ${data.category} item (${data.rarity}):
Name: ${data.name}
Description: ${data.description}
Cost: ${data.cost} spoons
`;
                }).join('\n') : '';

        const prompt = `Generate a UNIQUE discount code/voucher for Olive Oil from SELO (seloolive.com) with the following specifications:
Category: Olive Oil (discount code only)
Rarity: ${rarity}

IMPORTANT: Create something COMPLETELY NEW and UNIQUE. Do not reuse or slightly modify any existing items.
The following names are already taken and cannot be used (even with slight modifications):
${existingNames}

Here are some items for STYLE REFERENCE ONLY. Match their tone and writing style, but create something entirely different:

${examples}
${rarityExamples}

Guidelines for your UNIQUE creation:

1. Name must be:
   - COMPLETELY UNIQUE (not similar to any existing names listed above)
   - A voucher/discount code name for premium Croatian olive oil
   - Match the rarity level (common = small discount, legendary = major discount)
   - E.g. "Summer Harvest Voucher", "Golden Grove Discount", "Dalmatian Coast Special"

2. Description must:
   - Describe the discount/voucher for SELO Olive Oil
   - Include the discount value or benefit (e.g. "10% off", "Free shipping")
   - Be compelling and appetizing
   - Match the rarity's prestige level

3. Cost should:
   - Match the rarity tier:
     * Common: 200-300 spoons
     * Uncommon: 400-600 spoons
     * Rare: 1000-1500 spoons
     * Epic: 2500-3000 spoons
     * Legendary: 5000-7500 spoons

4. Image URL should follow the pattern: /marketplace/item-name.jpg (convert item name to kebab-case)

Please provide the item details in the following JSON format:
{
    "name": "Voucher Name",
    "description": "Item description...",
    "cost": number,
    "imageUrl": "image url path"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a creative copywriter who creates unique discount codes and vouchers for premium Croatian olive oil (SELO brand). You never copy or slightly modify existing items - instead, you create entirely new concepts. You only respond with valid JSON."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.9, // Slightly higher temperature for more creativity while maintaining style
        });

        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error('No content in response');
        }

        // Parse the JSON response
        const itemData = JSON.parse(content);

        // Convert item name to kebab case for image URL if not already done
        if (!itemData.imageUrl.includes('-')) {
            const kebabName = itemData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            itemData.imageUrl = `/marketplace/${kebabName}.jpg`;
        }

        return NextResponse.json(itemData);
    } catch (error) {
        console.error('Error generating goodie:', error);
        return NextResponse.json(
            { error: 'Failed to generate goodie' },
            { status: 500 }
        );
    }
}