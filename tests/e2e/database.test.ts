import { test, expect } from '@playwright/test';
import { prisma } from '../../lib/prisma';

test.describe('Database Connectivity', () => {
    test('should connect to the database and query users', async () => {
        // This test verifies that the database is reachable and the Prisma client is correctly configured.
        // It's considered an E2E test as it validates the connection to an external dependency.
        
        try {
            const userCount = await prisma.user.count();
            expect(userCount).toBeGreaterThanOrEqual(0);
            console.log('Successfully connected! User count:', userCount);
        } catch (error) {
            // We expect this to fail currently because of the connection issue we're debugging
            console.error('Database connection failed as expected:', error.message);
            throw error;
        }
    });
});
