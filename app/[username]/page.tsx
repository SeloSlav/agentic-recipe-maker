import React from 'react';
import { isReservedPath } from '../config/reservedPaths';
import { notFound } from 'next/navigation';
import UserProfileClient from './UserProfileClient';
import { SidebarLayout } from '../components/SidebarLayout';
import { collection, query, where, getDocs } from '../lib/backend/database';
import { db } from "../lib/backend/client";

type Props = {
    params: Promise<{ username: string }>;
}

export default async function UserProfile(props: Props) {
    const { username } = await props.params;

    // Check if username is a reserved path
    if (isReservedPath(username)) {
        notFound();
    }

    // Find user by username
    const usersQuery = query(
        collection(db, 'users'),
        where('username', '==', username.toLowerCase())
    );
    const userSnapshot = await getDocs(usersQuery);

    if (userSnapshot.empty) {
        notFound();
    }

    const userId = userSnapshot.docs[0].id;

    return (
        <SidebarLayout>
            <UserProfileClient userId={userId} username={username} />
        </SidebarLayout>
    );
}