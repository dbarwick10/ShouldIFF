//displayAverageEventTimes.js shouldiff

import { 
    fetchGameData, 
    clearGameState, 
    getCurrentGameState,
    initializeWithHistoricalData 
} from '../services/leagueClientService.js';

import { FETCH_INTERVAL_MS, RETRY_INTERVAL_MS } from "./config/constraints.js"; 

export async function displayAverageEventTimes(averageEventTimes, calculateStats) {
    console.log('Initializing displayAverageEventTimes');
    
    initializeWithHistoricalData(averageEventTimes);

    let currentLiveStats = null;
    let previousGameStats = null;
    let lastValidGameData = null;
    let refreshInterval;
    let retryTimeout;
    let charts = {};
    let currentCategory = 'teamStats';
    let isPolling = false;
    let isCumulativeMode = false;
    let gameActive = false;

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

    function calculateAverageGameTime(categoryData) {
        let totalTime = 0;
        let count = 0;
        
        ['wins', 'losses', 'surrenderWins', 'surrenderLosses'].forEach(outcome => {
            if (categoryData[outcome]?.gameLength) {
                totalTime += categoryData[outcome].gameLength;
                count++;
            }
        });
        
        return count > 0 ? totalTime / count : 1800; // Default to 30 minutes if no data
    }

    function getCumulativeValue(categoryData, stat, index, baseValue) {
        if (!isCumulativeMode) return baseValue;
        
        const cumulativeArray = categoryData[stat + 'Cumulative'];
        if (!Array.isArray(cumulativeArray)) return baseValue;
        
        // Calculate average game time for normalization
        const averageGameTime = calculateAverageGameTime(averageEventTimes[currentCategory]);
        const gameTimePercent = (categoryData[stat][index] / categoryData.gameLength) * 100;
        const normalizedMinute = (gameTimePercent / 100) * (averageGameTime / 60);
        
        return {
            y: cumulativeArray[index] ?? baseValue,
            x: normalizedMinute
        };
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
                                y: isCumulativeMode ? 
                                    categoryData.timeSpentDead[index] : 
                                    categoryData.timeSpentDead[index]
                            }))
                            .filter(point => point.x != null && point.y != null);
                    }
                } else if (stat === 'kda') {
                    data = isCumulativeMode ?
                        categoryData.kdaCumulative || [] :
                        generateKDAData(
                            categoryData.kills || [],
                            categoryData.deaths || [],
                            categoryData.assists || []
                        );
                    } else if (Array.isArray(categoryData[stat])) {
                        data = categoryData[stat].map((time, index) => {
                            const cumulativeValue = getCumulativeValue(categoryData, stat, index, index + 1);
                            return isCumulativeMode ? 
                                { x: cumulativeValue.x, y: cumulativeValue.y } :
                                { x: time / 60, y: index + 1 };
                        });
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
                                y: isCumulativeMode ? 
                                    previousGameStats[currentCategory].totalTimeSpentDead[index] : 
                                    previousGameStats[currentCategory].timeSpentDead[index]
                            }))
                            .filter(point => point.x != null && point.y != null);
                    }
                } else if (stat === 'kda') {
                    dataToAdd = isCumulativeMode ?
                        previousGameStats[currentCategory].kdaCumulative || [] :
                        generateKDAData(
                            previousGameStats[currentCategory].kills || [],
                            previousGameStats[currentCategory].deaths || [],
                            previousGameStats[currentCategory].assists || []
                        );
                    } else if (Array.isArray(previousGameStats[currentCategory][stat])) {
                        dataToAdd = previousGameStats[currentCategory][stat].map((time, index) => ({
                            x: time / 60,
                            y: getCumulativeValue(previousGameStats[currentCategory], stat, index, index + 1)
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
                                y: isCumulativeMode ? 
                                    currentLiveStats[currentCategory].totalTimeSpentDead[index] : 
                                    currentLiveStats[currentCategory].timeSpentDead[index]
                            }))
                            .filter(point => point.x != null && point.y != null);
                    }
                } else if (stat === 'kda') {
                    dataToAdd = isCumulativeMode ?
                        currentLiveStats[currentCategory].kdaCumulative || [] :
                        generateKDAData(
                            currentLiveStats[currentCategory].kills || [],
                            currentLiveStats[currentCategory].deaths || [],
                            currentLiveStats[currentCategory].assists || []
                        );
                    } else if (Array.isArray(currentLiveStats[currentCategory][stat])) {
                        dataToAdd = currentLiveStats[currentCategory][stat].map((time, index) => ({
                            x: time / 60,
                            y: getCumulativeValue(currentLiveStats[currentCategory], stat, index, index + 1)
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
                        text: `${capitalizeFirstLetter(currentCategory.replace('Stats', ''))} ${
                            stat === 'deathTimers' ? 'Time Spent Dead' : 
                            stat === 'kda' ? 'KDA' : 
                            capitalizeFirstLetter(stat)
                        } Over Time`,
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
                                const totalMinutes = context.parsed.x;
                                const minutes = Math.floor(totalMinutes);
                                const seconds = Math.floor((totalMinutes - minutes) * 60);

                                const timeFormatted = `${minutes}m ${seconds}s`;

                                if (stat === 'deathTimers') {
                                    return `${label}: ${value.toFixed(1)}s at ${timeFormatted}`;
                                } else if (stat === 'kda') {
                                    return `${label}: ${value.toFixed(2)} at ${timeFormatted}`;
                                } else {
                                    return `${label}: ${value} at ${timeFormatted}`;
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
                            display: false, 
                            text: stat === 'deathTimers' ? 'Time of Death (Minutes)' : 'Time (Minutes)',
                            font: {
                                weight: 'bold'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)',
                            drawOnChartArea: true,
                            display: true,
                            stepSize: 5  // Grid lines every 5 minutes
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
            const gameData = await fetchGameData();
            
            // Even if we don't have live data, we'll still have historical data to display
            currentLiveStats = gameData.currentLiveStats;
            previousGameStats = gameData.previousGameStats;
            gameActive = gameData.gameActive;
    
            // Manage polling state based on whether we have an active game
            if (gameActive && !isPolling) {
                isPolling = true;
                restartPolling(FETCH_INTERVAL_MS);
            } else if (!gameActive && isPolling) {
                isPolling = false;
                restartPolling(RETRY_INTERVAL_MS);
            }
    
            // Always update the visualization, whether we're showing live or historical data
            updateChartVisibility();
            charts = renderAllCharts();
            
        } catch (error) {
            console.log('Error updating data:', error);
            
            // On error, get the current state which will include historical data if no live data
            const currentState = getCurrentGameState();
            currentLiveStats = currentState.currentLiveStats;
            previousGameStats = currentState.previousGameStats;
            gameActive = currentState.gameActive;
    
            if (isPolling) {
                isPolling = false;
                restartPolling(RETRY_INTERVAL_MS);
            }
            
            updateChartVisibility();
            charts = renderAllCharts();
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
    // document.getElementById('displayModeBtn').addEventListener('click', () => {
    //     isCumulativeMode = !isCumulativeMode;
    //     document.getElementById('displayModeBtn').textContent = 
    //         isCumulativeMode ? 'Switch to Exact' : 'Switch to Cumulative';
    //     charts = renderAllCharts();
    // });
        
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
            // document.getElementById('displayModeBtn').addEventListener('click', () => {
            //     isCumulativeMode = !isCumulativeMode;
            //     document.getElementById('displayModeBtn').textContent = 
            //         isCumulativeMode ? 'Switch to Exact' : 'Switch to Cumulative';
            //     charts = renderAllCharts();
            // });
        }
    };
} catch (error) {
    console.error('Error displaying average event times:', error);
    throw error;
}
}
