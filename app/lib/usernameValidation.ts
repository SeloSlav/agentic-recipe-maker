import { collection, query, where, getDocs, doc, getDoc } from './backend/database';
import { db } from "./backend/client";
import { isReservedPath } from '../config/reservedPaths';

export interface UsernameValidationResult {
    isValid: boolean;
    error?: string;
}

export const validateUsername = async (username: string, userId?: string): Promise<UsernameValidationResult> => {
    // Check if username is empty
    if (!username.trim()) {
        return {
            isValid: false,
            error: 'Username cannot be empty'
        };
    }

    // If userId is provided, check if user already has a username
    if (userId) {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists() && userDoc.data().username && !username.trim()) {
            return {
                isValid: false,
                error: 'Cannot remove an existing username'
            };
        }
    }

    // Check length
    if (username.length < 3 || username.length > 20) {
        return {
            isValid: false,
            error: 'Username must be between 3 and 20 characters'
        };
    }

    // Check characters (only letters, numbers, and underscores)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return {
            isValid: false,
            error: 'Username can only contain letters, numbers, and underscores'
        };
    }

    // Check if it's a reserved path
    if (isReservedPath(username)) {
        return {
            isValid: false,
            error: 'This username is not available'
        };
    }

    // Check if username already exists (excluding current user if userId provided)
    const usersQuery = query(
        collection(db, 'users'),
        where('username', '==', username.toLowerCase())
    );
    const userSnapshot = await getDocs(usersQuery);

    if (!userSnapshot.empty) {
        // If userId is provided, check if the username belongs to the current user
        if (userId) {
            const exists = userSnapshot.docs.some(doc => doc.id !== userId);
            if (exists) {
                return {
                    isValid: false,
                    error: 'Username is already taken'
                };
            }
        } else {
            return {
                isValid: false,
                error: 'Username is already taken'
            };
        }
    }

    return { isValid: true };
};