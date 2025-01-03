// Main fetch functions
async function getPuuid() {
    const summonerName = document.getElementById('summonerName').value;
    const tagline = document.getElementById('tagLine').value;
    const region = document.getElementById('region').value;

    if (!summonerName) {
        alert('Please enter a summoner name');
        return;
    }

    try {
        const tag = tagline.replace(/[^a-zA-Z0-9 ]/g, "");
        console.log(`Fetching PUUID for ${summonerName} (${tagline}) in ${region}`);
        const puuidResponse = await fetch(`http://localhost:3000/api/puuid?summonerName=${encodeURIComponent(summonerName)}&region=${encodeURIComponent(region)}&tagline=${encodeURIComponent(tag)}`);
        
        if (!puuidResponse.ok) {
            const errorDetail = await puuidResponse.text();
            throw new Error(`Failed to fetch PUUID: ${errorDetail}`);
        }

        const puuidData = await puuidResponse.json();
        
        return puuidData.puuid;
    } catch (error) {
        console.error('Error fetching PUUID:', error);
        document.getElementById('output').innerHTML = `<p>Error fetching PUUID: ${error.message}</p>`;
        return null;
    }
}

async function fetchMatchStats() {
    try {
        const region = document.getElementById('region').value;
        const puuid = await getPuuid();
        if (!puuid) {
            console.error('No PUUID received');
            return;
        }

        document.getElementById('output').innerHTML = `
                <div class="saving"><strong>Fetching Previous Game Data</strong>
                <span>.</span><span>.</span><span>.</span></div>
                `;

            console.log('Fetching match stats...');
            const response = await fetch(`http://localhost:3000/api/match-stats?puuid=${encodeURIComponent(puuid)}&region=${encodeURIComponent(region)}`);
            // console.log('Match stats fetched:', await response.json()); // This will log the result of match stats

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch match stats: ${errorText}`);
        }

        const matchStats = await response.json();
        const playerStats = calculatePlayerStats(matchStats, puuid);
        const teamStats = calculateTeamStats(matchStats, puuid);
        const enemyTeamStats = calculateEnemyTeamStats(matchStats, puuid);
        
        console.log(`Found data from ${matchStats.length} matches.`)
        displayStats(playerStats, teamStats, enemyTeamStats);
        
    } catch (error) {
        console.error('Error fetching match stats:', error);
        document.getElementById('output').innerHTML = `<p>Error fetching match stats: ${error.message}</p>`;
    }
}

function calculatePlayerStats(matchStats, puuid) {
    const playerStats = {
        wins: [],
        losses: [],
        surrenderWins: [],
        surrenderLosses: [],
        winTime: [],
        lossTime: [],
        surrenderWinTime: [],
        surrenderLossTime: []
    };

    matchStats.forEach(match => {
        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) return;

        const kda = (player.kills + player.assists) / (player.deaths || 1);
        const gameDuration = (match.info.gameEndTimestamp - match.info.gameStartTimestamp) / 1000;

        const gameData = {
            kda: kda,
            level: player.champLevel,
            itemGold: player.goldSpent,
            timeSpentDead: player.totalTimeSpentDead || 0,
            turretsKilled: player.turretKills || 0,
            inhibitorsKilled: player.inhibitorKills || 0,
            gameDuration: gameDuration
        };

        if (player.win) {
            playerStats.wins.push(gameData);
            playerStats.winTime.push(gameDuration);
        } else {
            playerStats.losses.push(gameData);
            playerStats.lossTime.push(gameDuration);
        }

        if (player.gameEndedInSurrender) {
            if (player.win) {
                playerStats.surrenderWins.push(gameData);
                playerStats.surrenderWinTime.push(gameDuration);
            } else {
                playerStats.surrenderLosses.push(gameData);
                playerStats.surrenderLossTime.push(gameDuration);
            }
        }
    });

    // Calculate average times
    const calculateAverage = (times) => {
        const sum = times.reduce((a, b) => a + b, 0);
        return (sum / times.length) || 0;
    };

    playerStats.averageWinTime = calculateAverage(playerStats.winTime);
    playerStats.averageLossTime = calculateAverage(playerStats.lossTime);
    playerStats.averageSurrenderWinTime = calculateAverage(playerStats.surrenderWinTime);
    playerStats.averageSurrenderLossTime = calculateAverage(playerStats.surrenderLossTime);

    playerStats.winTime = `${(playerStats.averageWinTime / 60).toFixed(0)}m ${(playerStats.averageWinTime % 60).toFixed(0)}s`
    playerStats.lossTime = `${(playerStats.averageLossTime / 60).toFixed(0)}m ${(playerStats.averageLossTime % 60).toFixed(0)}s`
    playerStats.surrenderWinTime = `${(playerStats.averageSurrenderWinTime / 60).toFixed(0)}m ${(playerStats.averageSurrenderWinTime % 60).toFixed(0)}s`
    playerStats.surrenderLossTime = `${(playerStats.averageSurrenderLossTime / 60).toFixed(0)}m ${(playerStats.averageSurrenderLossTime % 60).toFixed(0)}s`

    return playerStats;
}


function calculateTeamStats(matchStats, puuid) {
    const teamStats = {
        wins: [],
        losses: [],
        surrenderWins: [],
        surrenderLosses: [],
    };

    matchStats.forEach(match => {
        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) return;

        const playerTeam = match.info.participants.filter(p => p.teamId === player.teamId);
        const gameDuration = (match.info.gameEndTimestamp - match.info.gameStartTimestamp) / 1000

        const teamGameData = {
            kda: playerTeam.reduce((sum, teammate) => sum + (teammate.kills + teammate.assists) / (teammate.deaths || 1), 0) / playerTeam.length,
            level: playerTeam.reduce((sum, teammate) => sum + teammate.champLevel, 0) / playerTeam.length,
            itemGold: playerTeam.reduce((sum, teammate) => sum + teammate.goldSpent, 0) / playerTeam.length,
            timeSpentDead: playerTeam.reduce((sum, teammate) => sum + (teammate.totalTimeSpentDead || 0), 0) / playerTeam.length,
            turretsKilled: playerTeam.reduce((sum, teammate) => sum + (teammate.turretKills || 0), 0),
            inhibitorsKilled: playerTeam.reduce((sum, teammate) => sum + (teammate.inhibitorKills || 0), 0),
            gameDuration: gameDuration // Include game duration in seconds
        };

        const team = match.info.teams.find(t => t.teamId === player.teamId);
        if (team) {
            if (team.win) {
                teamStats.wins.push(teamGameData);
                if (player.gameEndedInSurrender) {
                    teamStats.surrenderWins.push(teamGameData);
                }
            } else {
                teamStats.losses.push(teamGameData);
                if (player.gameEndedInSurrender) {
                    teamStats.surrenderLosses.push(teamGameData);
                }
            }
        }
    });

    return teamStats;
}

function calculateEnemyTeamStats(matchStats, puuid) {
    const enemyTeamStats = {
        wins: [],
        losses: [],
        surrenderWins: [],
        surrenderLosses: [],
    };

    matchStats.forEach(match => {
        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) return;

        const enemyTeam = match.info.participants.filter(p => p.teamId !== player.teamId);
        const gameDuration = (match.info.gameEndTimestamp - match.info.gameStartTimestamp) / 1000

        const enemyTeamGameData = {
            kda: enemyTeam.reduce((sum, enemy) => sum + (enemy.kills + enemy.assists) / (enemy.deaths || 1), 0) / enemyTeam.length,
            level: enemyTeam.reduce((sum, enemy) => sum + enemy.champLevel, 0) / enemyTeam.length,
            itemGold: enemyTeam.reduce((sum, enemy) => sum + enemy.goldSpent, 0) / enemyTeam.length,
            timeSpentDead: enemyTeam.reduce((sum, enemy) => sum + (enemy.totalTimeSpentDead || 0), 0) / enemyTeam.length,
            turretsKilled: enemyTeam.reduce((sum, enemy) => sum + (enemy.turretKills || 0), 0),
            inhibitorsKilled: enemyTeam.reduce((sum, enemy) => sum + (enemy.inhibitorKills || 0), 0),
            gameDuration: gameDuration // Add game duration in seconds
        };

        const enemyTeamResult = match.info.teams.find(t => t.teamId !== player.teamId);
        if (enemyTeamResult) {
            if (!enemyTeamResult.win) {
                enemyTeamStats.losses.push(enemyTeamGameData);
                if (player.gameEndedInSurrender) {
                    enemyTeamStats.surrenderLosses.push(enemyTeamGameData);
                }
            } else {
                enemyTeamStats.wins.push(enemyTeamGameData);
                if (player.gameEndedInSurrender) {
                    enemyTeamStats.surrenderWins.push(enemyTeamGameData);
                }
            }
        }
    });

    return enemyTeamStats;
}


function generateRow(category, section, playerStats, teamStats, enemyTeamStats) {
    const stats = section.data[category];
    let count;

    if (Array.isArray(stats)) {
        count = stats.length;
    } else {
        count = Object.keys(stats).length;
    }

    // Calculate averages for each stat and game time in minutes:seconds
    const avgKDA = calculateAverage(stats, 'kda');
    const avgLevel = calculateAverage(stats, 'level');
    const avgItemGold = calculateAverage(stats, 'itemGold');
    const avgTimeSpentDead = calculateAverage(stats, 'timeSpentDead');
    const avgTurretsKilled = calculateAverage(stats, 'turretsKilled');
    const avgInhibitorsKilled = calculateAverage(stats, 'inhibitorsKilled');
    const avgGameTimeSeconds = calculateAverage(stats, 'gameDuration');
    const avgGameTimeMinutes = Math.floor(avgGameTimeSeconds / 60);
    const avgGameTimeRemainderSeconds = Math.floor(avgGameTimeSeconds % 60);

    return `
        <tr>
            <td>${capitalize(category)}</td>
            <td>${section.name}</td>
            <td>${avgKDA.toFixed(2)}</td>
            <td>${avgLevel.toFixed(2)}</td>
            <td>${avgItemGold.toFixed(0)}</td>
            <td>${avgTimeSpentDead.toFixed(2)}</td>
            <td>${avgTurretsKilled.toFixed(2)}</td>
            <td>${avgInhibitorsKilled.toFixed(2)}</td>
        </tr>`;
}


function calculateAverage(stats, key) {
    if (Array.isArray(stats)) {
        return stats.reduce((sum, item) => sum + item[key], 0) / stats.length;
    } else {
        return stats[key];
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function displayStats(playerStats, teamStats, enemyTeamStats) {
    const summonerName = document.getElementById('summonerName').value;
    const output = document.getElementById('output'); 
    const playerSummary = document.getElementById('player-summary');
    
    // Calculate player stats summary
    const playerWins = playerStats.wins.length;
    const playerLosses = playerStats.losses.length;
    const playerSurrenderWins = playerStats.surrenderWins.length;
    const playerSurrenderLosses = playerStats.surrenderLosses.length;
    const winTime = playerStats.winTime;
    const lossTime = playerStats.lossTime;
    const surrenderWinTime = playerStats.surrenderWinTime;
    const surrenderLossTime = playerStats.surrenderLossTime;

    const summaryItems = [
        { label: "Wins", count: playerWins, time: winTime },
        { label: "Losses", count: playerLosses, time: lossTime },
        { label: "Surrender Wins", count: playerSurrenderWins, time: surrenderWinTime },
        { label: "Surrender Losses", count: playerSurrenderLosses, time: surrenderLossTime }
    ];

    // Create player summary HTML
    const playerSummaryHtml = summaryItems.map(item => 
        `<li><strong>${item.label}:</strong> ${item.count} <span class="time">(${item.time})</span></li>`
    ).join('');

    // Categories for stats display
    const categories = ['wins', 'losses', 'surrenderWins', 'surrenderLosses'];
    const statSections = [
        { name: `${summonerName}`, data: playerStats },
        { name: 'Team', data: teamStats },
        { name: 'Enemy', data: enemyTeamStats }
    ];

    const rows = categories.flatMap(category =>
        statSections.map(section => generateRow(category, section, playerStats, teamStats, enemyTeamStats))
    );

    // Update output inner HTML

    playerSummary.innerHTML = `
        <div class="player-summary">
            ${playerSummaryHtml}
        </div>
    `;
    output.innerHTML = `
        <div>
            <table>
                <tr>
                    <th>Outcome</th><th>Category</th><th>Average KDA</th><th>Average Level</th><th>Average Item Gold</th><th>Average Time Spent Dead</th><th>Average Turrets Killed</th><th>Average Inhibitors Killed</th>
                </tr>
                ${rows.join('')}
            </table>
        </div>`;
}


document.addEventListener('DOMContentLoaded', function() {
    const analyzeButton = document.getElementById('fetchStatsButton');
    if (analyzeButton) {
        analyzeButton.addEventListener('click', async function() {
            this.disabled = true;  // Prevent double-clicking
            try {
                await fetchMatchStats();
            } finally {
                this.disabled = false;  // Re-enable the button
            }
        });
    }
});