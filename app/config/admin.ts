import { db } from "../lib/backend/client";
import { doc, getDoc, setDoc, serverTimestamp } from '../lib/backend/database';

// Helper function to check if a user is an admin
export const isAdmin = async (uid: string | undefined): Promise<boolean> => {
    // console.log('=== Admin Check Function ===');
    // console.log('Checking admin status for UID:', uid);

    if (!uid) {
        // console.log('No UID provided, returning false');
        return false;
    }

    try {
        // Check the admins collection
        const adminDoc = await getDoc(doc(db, 'admins', uid));
        const isUserAdmin = adminDoc.exists() && adminDoc.data().active === true;

        // console.log('Admin document exists:', adminDoc.exists());
        // console.log('Admin status:', isUserAdmin);

        return isUserAdmin;
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
};

// Helper function to create an admin document
export const createAdmin = async (uid: string): Promise<boolean> => {
    try {
        // Create the admin document with the UID as the document ID
        await setDoc(doc(db, 'admins', uid), {
            active: true,
            addedAt: serverTimestamp(),
            addedBy: uid, // Self-added
            userId: uid
        });
        return true;
    } catch (error) {
        console.error('Error creating admin document:', error);
        return false;
    }
};