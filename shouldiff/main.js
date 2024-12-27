import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
app.commandLine.appendSwitch('ignore-certificate-errors');

let serverProcess = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1366,
        height: 768,  
		icon: "shouldiff_app\\Icon\\leeg.ico",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
			webSecurity: false,
            allowRunningInsecureContent: true,
        },
    });

    win.loadFile(path.join(app.getAppPath(), 'index.html'));
	win.setMenu(null)
}

function killServer() {
    if (serverProcess) {
        console.log('Shutting down server...');
        try {
            if (process.platform === 'win32') {
                // Kill process and its children on Windows
                spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
            } else {
                serverProcess.kill('SIGTERM');
            }
            serverProcess = null;
        } catch (error) {
            console.error('Error shutting down server:', error);
        }
    }
}

app.whenReady().then(() => {
    createWindow();

    const serverPath = path.join(app.getAppPath(), 'server/server.js');
    console.log('Starting server from:', serverPath);

    // For Windows
    if (process.platform === 'win32') {

        // // Use this to shown the CMD window
        // serverProcess = spawn('cmd.exe', ['/c', 'node', serverPath], {
        //     stdio: 'inherit',
        //     shell: true,
        //     detached: true,
        //     windowsHide: false
        // });

        // Use this to hide the CMD window
        serverProcess = spawn('node', [serverPath], {
            stdio: 'pipe',      
            shell: false,       
            detached: false,    
            windowsHide: true   
        });

    } else {
        // For Mac/Linux
        serverProcess = spawn('node', [serverPath], {
            stdio: 'inherit',
            shell: true,
            detached: true
        });
    }

    serverProcess.on('exit', (code, signal) => {
        console.log(`Server process exited with code ${code} and signal ${signal}`);
        serverProcess = null;
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Handle cleanup on app exit
app.on('before-quit', () => {
    killServer();
});

app.on('window-all-closed', () => {
    killServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Additional cleanup on app quit
app.on('quit', () => {
    killServer();
});