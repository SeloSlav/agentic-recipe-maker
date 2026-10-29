import { collection, query, where, getDocs, orderBy, limit } from './backend/database';
import { db } from "./backend/client";

export async function generateImageHash(file: File): Promise<string> {
  // Convert file to array buffer
  const buffer = await file.arrayBuffer();
  // Convert buffer to byte array
  const byteArray = new Uint8Array(buffer);
  // Use SubtleCrypto to create SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', byteArray);
  // Convert hash to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Calculate similarity between two hashes
function calculateHashSimilarity(hash1: string, hash2: string): number {
  let matchingChars = 0;
  const length = Math.min(hash1.length, hash2.length);

  for (let i = 0; i < length; i++) {
    if (hash1[i] === hash2[i]) {
      matchingChars++;
    }
  }

  return matchingChars / length;
}

export async function checkImageSimilarity(imageHash: string, userId: string): Promise<boolean> {
  // Check for similar hashes (fuzzy matching)
  const userUploadsQuery = query(
    collection(db, "imageHashes"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc"),
    limit(10)
  );

  const snapshots = await getDocs(userUploadsQuery);
  const similarityThreshold = 0.9; // 90% similarity threshold

  for (const doc of snapshots.docs) {
    const existingHash = doc.data().hash;
    if (calculateHashSimilarity(imageHash, existingHash) > similarityThreshold) {
      return false; // Too similar to a recent upload
    }
  }
  return true;
}

// Verify file content type
export async function verifyImageContent(file: File): Promise<{ isValid: boolean; message?: string }> {
  // Check MIME type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, message: "Invalid file type. Please upload a JPEG, PNG, or GIF." };
  }

  // Check file header
  const buffer = await file.arrayBuffer();
  const arr = new Uint8Array(buffer).subarray(0, 4);
  const header = Array.from(arr).map(byte => byte.toString(16).padStart(2, '0')).join('');

  // Check magic numbers for common image formats
  const validHeaders = {
    jpeg: ['ffd8ff'],
    png: ['89504e47'],
    gif: ['47494638']
  };

  const isValidHeader =
    header.startsWith(validHeaders.jpeg[0]) || // JPEG
    header.startsWith(validHeaders.png[0]) || // PNG
    header.startsWith(validHeaders.gif[0]);   // GIF

  if (!isValidHeader) {
    return { isValid: false, message: "Invalid image format detected" };
  }

  return { isValid: true };
}

export async function checkPreviousAnalyses(imageHash: string): Promise<{ isValid: boolean; message?: string }> {
  const previousAnalysesQuery = query(
    collection(db, "imageAnalyses"),
    where("imageHash", "==", imageHash)
  );

  const previousAnalyses = await getDocs(previousAnalysesQuery);
  if (!previousAnalyses.empty) {
    const previousScore = previousAnalyses.docs[0].data().score;
    if (previousScore === 0) {
      return { isValid: false, message: "This image was previously identified as unrelated" };
    }
  }
  return { isValid: true };
}

export async function checkRecipeImageLimit(recipeId: string): Promise<{ isValid: boolean; message?: string }> {
  const recipeImageQuery = query(
    collection(db, "imageHashes"),
    where("recipeId", "==", recipeId),
    orderBy("timestamp", "desc")
  );

  const existingImages = await getDocs(recipeImageQuery);
  if (existingImages.size >= 3) {
    return { isValid: false, message: "Maximum number of images reached for this recipe (limit: 3)" };
  }
  return { isValid: true };
}