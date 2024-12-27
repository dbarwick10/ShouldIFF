import express from 'express';
import { calculateLiveStats } from '../features/liveMatchStats.js';

const router = express.Router();

// Helper function to clear object properties
function clearObject(obj) {
    if (!obj) return;
    for (const key in obj) {
        if (Array.isArray(obj[key])) {
            obj[key].length = 0;
        } else if (typeof obj[key] === 'object') {
            clearObject(obj[key]);
        }
        obj[key] = null;
    }
}

// Helper function to safely run garbage collection
function runGC() {
    if (global.gc) {
        try {
            global.gc();
        } catch (e) {
            console.error('GC failed:', e);
        }
    }
}

router.get('/live-stats', async (req, res) => {
    try {
        const liveStats = await calculateLiveStats();
        console.log('Live stats data'); // Add this

        if (!liveStats) {
            return res.status(404).json({ error: 'No live game found' });
        }
        res.json(liveStats);
    } catch (error) {
        console.error('Server error in /api/live-stats:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
});

export default router;