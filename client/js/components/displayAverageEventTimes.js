//displayAverageEventTimes.js shouldiff

// import { calculateLiveStats } from "../features/liveMatchStats.js";
// import { cloneDeep } from 'https://cdn.skypack.dev/lodash';
import { FETCH_INTERVAL_MS, RETRY_INTERVAL_MS } from "./config/constraints.js"; 

export async function displayAverageEventTimes(averageEventTimes, calculateStats) {
    console.log('Initializing displayAverageEventTimes');
    
    // const FETCH_INTERVAL_MS = 1000; // Regular polling interval
    // const RETRY_INTERVAL_MS = 120000; // Longer interval for retrying when server is down
    let currentLiveStats = null;
    let previousGameStats = null;
    let refreshInterval;
    let retryTimeout;
    let charts = {};
    let currentCategory = 'playerStats';
    let isPolling = false;

    const statKeys = ['wins', 'losses', 'surrenderWins', 'surrenderLosses'];
    const chartsToRender = ['kills', 'deaths', 'assists', 'kda', 'turrets', 'dragons', 'barons', 'elders', 'inhibitors', 'deathTimers'];
    
    const colorConfig = {
        wins: { borderColor: 'rgb(46, 204, 113, .75)', backgroundColor: 'rgb(46, 204, 113, 0.1)' },
        losses: { borderColor: 'rgb(231, 76, 60, .75)', backgroundColor: 'rgb(231, 76, 60, 0.1)' },
        surrenderWins: { borderColor: 'rgb(52, 152, 219, .75)', backgroundColor: 'rgb(52, 152, 219, 0.1)' },
        surrenderLosses: { borderColor: 'rgb(230, 126, 34, .75)', backgroundColor: 'rgb(230, 126, 34, 0.1)' },
        live: { borderColor: 'rgb(155, 89, 182, .75)', backgroundColor: 'rgb(155, 89, 182, 0.1)' },
        previousGame: { borderColor: 'rgb(149, 165, 166, .75)', backgroundColor: 'rgb(149, 165, 166, 0.1)' }
    };

    // Helper function to check if a dataset has any data points
    function hasData(datasets) {
        return datasets.some(dataset => dataset.data && dataset.data.length > 0);
    }

    function hasDataForOutcome(category, outcomeType) {
        if (!averageEventTimes?.[category]?.[outcomeType]) return false;
        
        return ['kills', 'deaths', 'assists', 'turrets', 'dragons', 'barons', 'elders', 'inhibitors'].some(stat => 
            Array.isArray(averageEventTimes[category][outcomeType][stat]) && 
            averageEventTimes[category][outcomeType][stat].length > 0
        );
    }
    
    function updateLegendVisibility() {
        // Check for data in each category
        const hasWins = hasDataForOutcome(currentCategory, 'wins');
        const hasLosses = hasDataForOutcome(currentCategory, 'losses');
        const hasSurrenderWins = hasDataForOutcome(currentCategory, 'surrenderWins');
        const hasSurrenderLosses = hasDataForOutcome(currentCategory, 'surrenderLosses');
        const hasCurrentGame = currentLiveStats && Object.keys(currentLiveStats).length > 0;
        const hasPreviousGame = previousGameStats && Object.keys(previousGameStats).length > 0;
    
        // Get legend items
        const winsLegend = document.querySelector('.legend-item.wins');
        const lossesLegend = document.querySelector('.legend-item.losses');
        const surrenderWinsLegend = document.querySelector('.legend-item.surrender-wins');
        const surrenderLossesLegend = document.querySelector('.legend-item.surrender-losses');
        const currentGameLegend = document.querySelector('.legend-item.current-game');
        const previousGameLegend = document.querySelector('.legend-item.previous-game')
    
        // Update visibility
        winsLegend.style.display = hasWins ? 'flex' : 'none';
        lossesLegend.style.display = hasLosses ? 'flex' : 'none';
        surrenderWinsLegend.style.display = hasSurrenderWins ? 'flex' : 'none';
        surrenderLossesLegend.style.display = hasSurrenderLosses ? 'flex' : 'none';
        currentGameLegend.style.display = hasCurrentGame ? 'flex' : 'none';
        previousGameLegend.style.display = hasPreviousGame ? 'flex' : 'none';
    
        // Show/hide the entire legend based on whether any items are visible
        const legendSection = document.querySelector('.chart-legend');
        const hasAnyData = hasWins || hasLosses || hasSurrenderWins || hasSurrenderLosses || hasCurrentGame;
        legendSection.style.display = hasAnyData ? 'flex' : 'none';
    }

    // Helper function to hide/show chart container
    function toggleChartVisibility(stat, visible) {
        const container = document.getElementById(`${stat}Chart`).parentElement;
        if (container) {
            container.style.display = visible ? 'block' : 'none';
        }

        document.querySelector('.chart-legend').style.display = 'flex';
        document.querySelector('.chart-container').style.display = 'grid';
    }

    function updateChartVisibility() {
        chartsToRender.forEach(stat => {
            const hasDataForStat = hasCategoryData(currentCategory, stat);
            toggleChartVisibility(stat, hasDataForStat);
        });
        updateLegendVisibility(); 
    }

    function toggleStats(category) {
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.style.backgroundColor = '#e0e0e0';
            btn.style.color = 'black';
        });
        document.getElementById(`${category}Btn`).style.backgroundColor = '#3498db';
        document.getElementById(`${category}Btn`).style.color = 'white';
        
        currentCategory = category;
        updateChartVisibility();
        updateLegendVisibility();
        charts = renderAllCharts();
    }

    const capitalizeFirstLetter = (string) => string.charAt(0).toUpperCase() + string.slice(1);


    function hasCategoryData(category, stat) {
        // Special check for deathTimers
        if (stat === 'deathTimers') {
            // Check historical data
            const hasHistoricalData = statKeys.some(key => {
                const categoryData = averageEventTimes[category][key];
                return categoryData?.deaths?.length > 0 && categoryData?.timeSpentDead?.length > 0;
            });
    
            // Check live game data - Now using nested structure
            const hasLiveData = currentLiveStats?.[category]?.deaths?.length > 0 && 
                              currentLiveStats?.[category]?.timeSpentDead?.length > 0;
    
            // Check previous game data - Now using nested structure
            const hasPreviousData = previousGameStats?.[category]?.deaths?.length > 0 && 
                                  previousGameStats?.[category]?.timeSpentDead?.length > 0;
    
            return hasHistoricalData || hasLiveData || hasPreviousData;
        }
    
        // Check historical data
        const hasHistoricalData = statKeys.some(key => {
            const categoryData = averageEventTimes[category][key];
            return categoryData && Array.isArray(categoryData[stat]) && categoryData[stat].length > 0;
        });
    
        // Check live game data - Modified to handle nested structure
        const hasLiveData = currentLiveStats?.[category] && (
            (stat === 'kda' && (
                currentLiveStats[category].kills?.length > 0 ||
                currentLiveStats[category].deaths?.length > 0 ||
                currentLiveStats[category].assists?.length > 0
            )) ||
            (currentLiveStats[category][stat]?.length > 0)
        );
    
        // Check previous game data - Modified to handle nested structure
        const hasPreviousData = previousGameStats?.[category] && (
            (stat === 'kda' && (
                previousGameStats[category].kills?.length > 0 ||
                previousGameStats[category].deaths?.length > 0 ||
                previousGameStats[category].assists?.length > 0
            )) ||
            (previousGameStats[category][stat]?.length > 0)
        );
    
        return hasHistoricalData || hasLiveData || hasPreviousData;
    }
    
     // Helper function to calculate KDA at a specific timestamp
     function calculateKDAAtTime(kills, deaths, assists, timestamp) {
        const killsBeforeTime = kills.filter(time => time <= timestamp).length;
        const deathsBeforeTime = deaths.filter(time => time <= timestamp).length;
        const assistsBeforeTime = assists.filter(time => time <= timestamp).length;
        
        // Avoid division by zero
        return deathsBeforeTime === 0 ? 
            killsBeforeTime + assistsBeforeTime : 
            ((killsBeforeTime + assistsBeforeTime) / deathsBeforeTime).toFixed(2);
    }

    // Helper function to generate KDA data points from individual events
    function generateKDAData(kills, deaths, assists) {
        if (!kills?.length && !deaths?.length && !assists?.length) return [];
        
        // Combine all timestamps and sort them
        const allEvents = [
            ...(kills || []).map(time => ({ time, type: 'kill' })),
            ...(deaths || []).map(time => ({ time, type: 'death' })),
            ...(assists || []).map(time => ({ time, type: 'assist' }))
        ].sort((a, b) => a.time - b.time);

        // Generate KDA value for each event
        return allEvents.map(event => ({
            x: event.time / 60,
            y: Number(calculateKDAAtTime(kills || [], deaths || [], assists || [], event.time))
        }));
    }

    function renderAllCharts() {
        // First, find the maximum time across all charts and categories
        let maxGameTime = 0;
    
        chartsToRender.forEach(stat => {
            if (!hasCategoryData(currentCategory, stat)) return;
    
            // Check historical data
            statKeys.forEach(key => {
                const categoryData = averageEventTimes[currentCategory][key];
                if (!categoryData) return;
    
                if (stat === 'deathTimers' && categoryData.deaths?.length > 0) {
                    maxGameTime = Math.max(maxGameTime, ...categoryData.deaths);
                } else if (stat === 'kda') {
                    const allTimes = [
                        ...(categoryData.kills || []),
                        ...(categoryData.deaths || []),
                        ...(categoryData.assists || [])
                    ];
                    if (allTimes.length > 0) {
                        maxGameTime = Math.max(maxGameTime, ...allTimes);
                    }
                } else if (Array.isArray(categoryData[stat]) && categoryData[stat].length > 0) {
                    maxGameTime = Math.max(maxGameTime, ...categoryData[stat]);
                }
            });
    
            // Check current game data
            if (currentLiveStats?.[currentCategory]) {
                if (stat === 'deathTimers' && currentLiveStats[currentCategory].deaths?.length > 0) {
                    maxGameTime = Math.max(maxGameTime, ...currentLiveStats[currentCategory].deaths);
                } else if (stat === 'kda') {
                    const allTimes = [
                        ...(currentLiveStats[currentCategory].kills || []),
                        ...(currentLiveStats[currentCategory].deaths || []),
                        ...(currentLiveStats[currentCategory].assists || [])
                    ];
                    if (allTimes.length > 0) {
                        maxGameTime = Math.max(maxGameTime, ...allTimes);
                    }
                } else if (Array.isArray(currentLiveStats[currentCategory][stat])) {
                    maxGameTime = Math.max(maxGameTime, ...currentLiveStats[currentCategory][stat]);
                }
            }
    
            // Check previous game data
            if (previousGameStats?.[currentCategory]) {
                if (stat === 'deathTimers' && previousGameStats[currentCategory].deaths?.length > 0) {
                    maxGameTime = Math.max(maxGameTime, ...previousGameStats[currentCategory].deaths);
                } else if (stat === 'kda') {
                    const allTimes = [
                        ...(previousGameStats[currentCategory].kills || []),
                        ...(previousGameStats[currentCategory].deaths || []),
                        ...(previousGameStats[currentCategory].assists || [])
                    ];
                    if (allTimes.length > 0) {
                        maxGameTime = Math.max(maxGameTime, ...allTimes);
                    }
                } else if (Array.isArray(previousGameStats[currentCategory][stat])) {
                    maxGameTime = Math.max(maxGameTime, ...previousGameStats[currentCategory][stat]);
                }
            }
        });
    
        // Convert to minutes and round up to nearest minute
        const maxTimeInMinutes = Math.ceil(maxGameTime / 60);
    
        // Clear existing charts
        chartsToRender.forEach(stat => {
            const canvas = document.getElementById(`${stat}Chart`);
            if (canvas) {
                const existingChart = Chart.getChart(canvas);
                if (existingChart) {
                    existingChart.destroy();
                }
            }
        });
    
        const newCharts = {};
    
        chartsToRender.forEach(stat => {
            if (!hasCategoryData(currentCategory, stat)) {
                return;
            }
    
            const datasets = [];
    
            // Add historical data
            statKeys.forEach((key) => {
                const categoryData = averageEventTimes[currentCategory][key];
                if (!categoryData) return;
    
                let data = [];
                
                if (stat === 'deathTimers') {
                    if (categoryData.deaths?.length > 0 && categoryData.timeSpentDead?.length > 0) {
                        data = categoryData.deaths
                            .map((deathTime, index) => ({
                                x: deathTime / 60,
                                y: categoryData.timeSpentDead[index]
                            }))
                            .filter(point => point.x != null && point.y != null);
                    }
                } else if (stat === 'kda') {
                    data = generateKDAData(
                        categoryData.kills || [],
                        categoryData.deaths || [],
                        categoryData.assists || []
                    );
                } else if (Array.isArray(categoryData[stat])) {
                    data = categoryData[stat].map((time, index) => ({
                        x: time / 60,
                        y: index + 1
                    }));
                }
    
                if (data.length > 0) {
                    datasets.push({
                        label: `Historical ${stat} (${key})`,
                        data: data,
                        borderColor: colorConfig[key].borderColor,
                        backgroundColor: colorConfig[key].backgroundColor,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 1
                    });
                }
            });
    
            // Add previous game data
            if (previousGameStats?.[currentCategory]) {
                let dataToAdd = [];
            
                if (stat === 'deathTimers') {
                    if (previousGameStats[currentCategory].deaths?.length > 0 && 
                        previousGameStats[currentCategory].timeSpentDead?.length > 0) {
                        dataToAdd = previousGameStats[currentCategory].deaths
                            .map((deathTime, index) => ({
                                x: deathTime / 60,
                                y: previousGameStats[currentCategory].timeSpentDead[index]
                            }))
                            .filter(point => point.x != null && point.y != null);
                    }
                } else if (stat === 'kda') {
                    dataToAdd = generateKDAData(
                        previousGameStats[currentCategory].kills || [],
                        previousGameStats[currentCategory].deaths || [],
                        previousGameStats[currentCategory].assists || []
                    );
                } else if (Array.isArray(previousGameStats[currentCategory][stat])) {
                    dataToAdd = previousGameStats[currentCategory][stat].map((time, index) => ({
                        x: time / 60,
                        y: index + 1
                    }));
                }
    
                if (dataToAdd.length > 0) {
                    datasets.push({
                        label: `Previous Game ${stat}`,
                        data: dataToAdd,
                        borderColor: colorConfig.previousGame.borderColor,
                        backgroundColor: colorConfig.previousGame.backgroundColor,
                        fill: false,
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 1
                    });
                }
            }
    
            // Add live game data
            if (currentLiveStats?.[currentCategory]) {
                let dataToAdd = [];
            
                if (stat === 'deathTimers') {
                    if (currentLiveStats[currentCategory].deaths?.length > 0 && 
                        currentLiveStats[currentCategory].totalTimeSpentDead?.length > 0) {
                        dataToAdd = currentLiveStats[currentCategory].deaths
                            .map((deathTime, index) => ({
                                x: deathTime / 60,
                                y: currentLiveStats[currentCategory].totalTimeSpentDead[index]
                            }))
                            .filter(point => point.x != null && point.y != null);
                    }
                } else if (stat === 'kda') {
                    dataToAdd = generateKDAData(
                        currentLiveStats[currentCategory].kills || [],
                        currentLiveStats[currentCategory].deaths || [],
                        currentLiveStats[currentCategory].assists || []
                    );
                } else if (Array.isArray(currentLiveStats[currentCategory][stat])) {
                    dataToAdd = currentLiveStats[currentCategory][stat].map((time, index) => ({
                        x: time / 60,
                        y: index + 1
                    }));
                }
            
                if (dataToAdd.length > 0) {
                    datasets.push({
                        label: `Current Game ${stat}`,
                        data: dataToAdd,
                        borderColor: colorConfig.live.borderColor,
                        backgroundColor: colorConfig.live.backgroundColor,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 1,
                        pointHoverRadius: 1
                    });
                }
            }
    
            if (datasets.length === 0) return;
    
            const ctx = document.getElementById(`${stat}Chart`).getContext('2d');
            
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: { 
                        display: true, 
                        text: stat === 'deathTimers' ? 'Time Spent Dead vs Time of Death' : 
                              (stat === 'kda' ? 'KDA' : capitalizeFirstLetter(stat)) + ' Over Time',
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'nearest',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                const time = context.parsed.x.toFixed(1);
                                if (stat === 'deathTimers') {
                                    return `${label}: ${value.toFixed(1)}s at ${time} min`;
                                } else if (stat === 'kda') {
                                    return `${label}: ${value.toFixed(2)} at ${time} min`;
                                } else {
                                    return `${label}: ${value} at ${time} min`;
                                }
                            }
                        }
                    },
                    legend: {
                        display: false,
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        min: 0,
                        max: maxTimeInMinutes,
                        title: { 
                            display: true, 
                            text: stat === 'deathTimers' ? 'Time of Death (Minutes)' : 'Time (Minutes)',
                            font: {
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            callback: value => value.toFixed(0),
                            stepSize: Math.max(1, Math.ceil(maxTimeInMinutes / 10))
                        }
                    },
                    y: { 
                        title: { 
                            display: true, 
                            text: stat === 'deathTimers' ? 'Time Spent Dead (Seconds)' : 
                                  stat === 'kda' ? 'KDA Ratio' : `Total ${capitalizeFirstLetter(stat)}`,
                            font: {
                                weight: 'bold'
                            }
                        },
                        beginAtZero: true,
                        ...(stat !== 'deathTimers' && stat !== 'kda' ? {
                            ticks: { stepSize: 1 }
                        } : {})
                    }
                },
                animation: { duration: 0 }
            };
    
            newCharts[stat] = new Chart(ctx, {
                type: 'line',
                data: { datasets },
                options: chartOptions
            });
        });
    
        return newCharts;
    }

    let lastValidGameData = null; // Add this to store the last valid game state

    // Update the isNewGame function
    function isNewGame(newStats, currentStats) {
        if (!newStats || !currentStats) return true;
        
        const category = currentCategory;
        
        // First, check if we're getting empty data when we previously had data
        const isEmpty = ['kills', 'deaths', 'assists'].every(stat => 
            (newStats[category]?.[stat]?.length || 0) === 0
        );
        
        const hadData = ['kills', 'deaths', 'assists'].some(stat => 
            (currentStats[category]?.[stat]?.length || 0) > 0
        );
        
        if (isEmpty && hadData) {
            console.log('Detected potential game end - preserving current data');
            return false; // Don't treat this as a new game, just preserve current data
        }

        // Check if this is actually a new game starting
        const isReset = ['kills', 'deaths', 'assists'].some(stat => {
            const newStatArray = newStats[category]?.[stat] || [];
            const currentStatArray = currentStats[category]?.[stat] || [];
            
            if (currentStatArray.length > 0 && newStatArray.length === 1) {
                console.log(`New game detected - first ${stat} recorded`);
                return true;
            }
            
            return false;
        });

        return isReset;
    }
    
    function haveLiveStatsChanged(newStats, currentStats) {
        if (!newStats || !currentStats) return true;
        
        const category = currentCategory;
        const statsToCheck = [
            'kills', 'deaths', 'assists', 'timeSpentDead', 'totalTimeSpentDead',
            'turrets', 'dragons', 'barons', 'elders', 'inhibitors'
        ];
        
        // Only compare array lengths and last values instead of deep comparison
        for (const stat of statsToCheck) {
            const newArray = newStats[category]?.[stat] || [];
            const currentArray = currentStats[category]?.[stat] || [];
            
            if (newArray.length !== currentArray.length) {
                return true;
            }
            
            // Only compare the last value if arrays have elements
            if (newArray.length > 0 && 
                newArray[newArray.length - 1] !== currentArray[currentArray.length - 1]) {
                return true;
            }
        }
        
        return false;
    }

// Update the startLiveDataRefresh function
async function startLiveDataRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }

    if (retryTimeout) {
        clearTimeout(retryTimeout);
    }
    
    let gameActive = false;
    let lastValidGameData = null;

    async function updateLiveData() {
        try {
            const response = await fetch('http://127.0.0.1:3000/api/live-stats')
                        
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('No active game found - preserving last game data');
                    if (gameActive) {
                        gameActive = false;
                        if (currentLiveStats) {
                            console.log('Game ended - saving current game data');
                            lastValidGameData = JSON.parse(JSON.stringify(currentLiveStats));
                        }
                    }
                    // Keep showing the last known state
                    if (lastValidGameData) {
                        currentLiveStats = JSON.parse(JSON.stringify(lastValidGameData));
                    }
                    updateChartVisibility();
                    charts = renderAllCharts();
                    return;
                }
                
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const newLiveStats = await response.json();
            
            if (!newLiveStats || newLiveStats === null) {
                if (gameActive && currentLiveStats) {
                    console.log('Game ended (null data) - saving game data');
                    lastValidGameData = JSON.parse(JSON.stringify(currentLiveStats));
                    gameActive = false;
                }
                if (lastValidGameData) {
                    currentLiveStats = JSON.parse(JSON.stringify(lastValidGameData));
                }
                updateChartVisibility();
                charts = renderAllCharts();
                return;
            }

            if (!isPolling) {
                isPolling = true;
                restartPolling(FETCH_INTERVAL_MS);
            }

            // Log incoming data state
            // console.log('Received new game data:', {
            //     category: currentCategory,
            //     stats: {
            //         kills: newLiveStats[currentCategory]?.kills?.length || 0,
            //         deaths: newLiveStats[currentCategory]?.deaths?.length || 0,
            //         assists: newLiveStats[currentCategory]?.assists?.length || 0,
            //         hasDeathTimers: Boolean(newLiveStats[currentCategory]?.deaths?.length && 
            //                              newLiveStats[currentCategory]?.timeSpentDead?.length)
            //     }
            // });

            const isEmpty = ['kills', 'deaths', 'assists'].every(stat => 
                (newLiveStats[currentCategory]?.[stat]?.length || 0) === 0
            );

            if (isEmpty && lastValidGameData) {
                console.log('Received empty data - maintaining last valid state');
                currentLiveStats = JSON.parse(JSON.stringify(lastValidGameData));
                updateChartVisibility();
                charts = renderAllCharts();
                return;
            }

            // New game detection
            if (!gameActive && hasValidStats(newLiveStats)) {
                console.log('New game starting - moving previous game data');
                if (lastValidGameData) {
                    console.log('Moving last game to previousGameStats');
                    previousGameStats = JSON.parse(JSON.stringify(lastValidGameData));
                    lastValidGameData = null;
                }
                gameActive = true;
                currentLiveStats = JSON.parse(JSON.stringify(newLiveStats));
            } else if (gameActive && hasValidStats(newLiveStats)) {
                // Update current game
                currentLiveStats = JSON.parse(JSON.stringify(newLiveStats));
                lastValidGameData = JSON.parse(JSON.stringify(newLiveStats));
            }

            updateChartVisibility();
            charts = renderAllCharts();
        } catch (error) {
            console.log('Error type:', error.message);
            if (error.message.includes('ECONNREFUSED')) {
                console.log('Game ended (ECONNREFUSED)');
                if (gameActive && currentLiveStats) {
                    gameActive = false;
                    lastValidGameData = JSON.parse(JSON.stringify(currentLiveStats));
                }
                if (lastValidGameData) {
                    currentLiveStats = JSON.parse(JSON.stringify(lastValidGameData));
                }
            }

            updateChartVisibility();
            charts = renderAllCharts();
            
            if (isPolling) {
                isPolling = false;
                restartPolling(RETRY_INTERVAL_MS);
            }
        }
    }

    function hasValidStats(stats) {
        const category = currentCategory;
        return ['kills', 'deaths', 'assists'].some(stat => 
            (stats[category]?.[stat]?.length || 0) > 0
        );
    }

    function restartPolling(interval) {
        if (refreshInterval) clearInterval(refreshInterval);
        if (retryTimeout) clearTimeout(retryTimeout);
        refreshInterval = setInterval(updateLiveData, interval);
    }

    await updateLiveData();
    
    if (!isPolling) {
        restartPolling(RETRY_INTERVAL_MS);
    }
}

try {
    // Add event listeners
    document.getElementById('playerStatsBtn').addEventListener('click', () => toggleStats('playerStats'));
    document.getElementById('teamStatsBtn').addEventListener('click', () => toggleStats('teamStats'));
    document.getElementById('enemyStatsBtn').addEventListener('click', () => toggleStats('enemyStats'));
        
    updateChartVisibility();
    charts = renderAllCharts();
    
    if (calculateStats) {
        console.log('Starting live data refresh...');
        await startLiveDataRefresh();
    } else {
        console.log('No live stats promise provided, running in historical-only mode');
    }
    
    console.log('Chart initialization complete');
    
    return {
        cleanup: () => {
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
            Object.values(charts).forEach(chart => chart.destroy());
            
            document.getElementById('playerStatsBtn').removeEventListener('click', () => toggleStats('playerStats'));
            document.getElementById('teamStatsBtn').removeEventListener('click', () => toggleStats('teamStats'));
            document.getElementById('enemyStatsBtn').removeEventListener('click', () => toggleStats('enemyStats'));
        }
    };
} catch (error) {
    console.error('Error displaying average event times:', error);
    throw error;
}
}
