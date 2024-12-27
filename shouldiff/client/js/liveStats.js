export async function fetchLiveStats() {
    try {
        const response = await fetch('/api/live-stats');
        if (!response.ok) {
            throw new Error('Failed to fetch live stats');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching live stats:', error);
        return null;
    }
}