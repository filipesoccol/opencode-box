#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const crypto = require('crypto');

// Simple colored output functions
const log = {
    info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`)
};



// Argument parsing and validation functions
function parseArguments() {
    const args = process.argv.slice(2);
    const modeFlags = ['--mount-ro', '--mount-rw', '--gitcheckout'];
    
    // Check for help and version flags first
    const showHelp = args.includes('--help') || args.includes('-h');
    const showVersion = args.includes('--version') || args.includes('-v');
    const rebuild = args.includes('--rebuild');
    const it = args.includes('--it');
    
    // If help or version is requested, return early without validation
    if (showHelp || showVersion) {
        return {
            mode: null,
            showHelp: showHelp,
            showVersion: showVersion,
            rebuild: false,
            it: false
        };
    }
    
    // Check for invalid flags
    const invalidFlags = args.filter(arg => 
        arg.startsWith('--') && 
        !modeFlags.includes(arg) && 
        !['--help', '-h', '--version', '-v', '--rebuild', '--it'].includes(arg)
    );
    
    if (invalidFlags.length > 0) {
        log.error(`Invalid flag(s): ${invalidFlags.join(', ')}`);
        console.log(`
OpenCode Box - A secure Docker environment for AI-assisted development with OpenCode

Usage: opencodebox <mode> [options]

Modes (exactly one required):
  --mount-ro      Mount current workspace as read-only
  --mount-rw      Mount current workspace as read-write  
  --gitcheckout   Clone repository inside container (default behavior)

Other options:
  --rebuild       Force rebuild Docker image (removes existing image)
  --help, -h      Show this help message
  --version, -v   Show version information
`);
        process.exit(1);
    }
    
    // Find mode flags
    const foundFlags = args.filter(arg => modeFlags.includes(arg));
    
    // Validate flag combinations
    if (foundFlags.length === 0) {
        log.error('No mode flag specified. Please use one of: --mount-ro, --mount-rw, --gitcheckout');
        console.log(`
OpenCode Box - A secure Docker environment for AI-assisted development with OpenCode

Usage: opencodebox <mode> [options]

Modes (exactly one required):
  --mount-ro      Mount current workspace as read-only
  --mount-rw      Mount current workspace as read-write  
  --gitcheckout   Clone repository inside container (default behavior)

Other options:
  --rebuild       Force rebuild Docker image (removes existing image)
  --help, -h      Show this help message
  --version, -v   Show version information
`);
        process.exit(1);
    }
    
    if (foundFlags.length > 1) {
        log.error(`Multiple mode flags specified: ${foundFlags.join(', ')}. Please use only one mode flag.`);
        console.log(`
OpenCode Box - A secure Docker environment for AI-assisted development with OpenCode

Usage: opencodebox <mode> [options]

Modes (exactly one required):
  --mount-ro      Mount current workspace as read-only
  --mount-rw      Mount current workspace as read-write  
  --gitcheckout   Clone repository inside container (default behavior)

Other options:
  --rebuild       Force rebuild Docker image (removes existing image)
  --help, -h      Show this help message
  --version, -v   Show version information
`);
        process.exit(1);
    }
    
    return {
        mode: foundFlags[0],
        showHelp: false,
        showVersion: false,
        rebuild: rebuild,
        it: it
    };
}

// Security validation functions
function validateRepositoryUrl(repoUrl) {
    if (!repoUrl || typeof repoUrl !== 'string') {
        throw new Error('Repository URL is required and must be a string');
    }

    // Remove any potential command injection characters
    const sanitized = repoUrl.trim();

    // Check for dangerous characters that could be used for command injection
    const dangerousChars = /[;&|`$(){}[\]<>]/;
    if (dangerousChars.test(sanitized)) {
        throw new Error('Repository URL contains invalid characters');
    }

    // Validate URL format
    try {
        const parsedUrl = new URL(sanitized);

        // Only allow specific protocols
        if (!['https:', 'ssh:', 'git:'].includes(parsedUrl.protocol)) {
            throw new Error('Only HTTPS, SSH, and Git protocols are allowed');
        }

        // Validate hostname for trusted Git providers
        const trustedHosts = [
            'github.com',
            'gitlab.com',
            'bitbucket.org',
            'dev.azure.com',
            'ssh.dev.azure.com'
        ];

        if (!trustedHosts.includes(parsedUrl.hostname)) {
            throw new Error(`Untrusted hostname: ${parsedUrl.hostname}. Only ${trustedHosts.join(', ')} are allowed`);
        }

        return sanitized;
    } catch (urlError) {
        // Try SSH format (git@github.com:user/repo.git)
        const sshPattern = /^git@([a-zA-Z0-9.-]+):([a-zA-Z0-9._/-]+)\.git$/;
        const sshMatch = sanitized.match(sshPattern);

        if (sshMatch) {
            const hostname = sshMatch[1];
            const trustedSshHosts = ['github.com', 'gitlab.com', 'bitbucket.org', 'git-gogs.lan'];

            if (!trustedSshHosts.includes(hostname)) {
                throw new Error(`Untrusted SSH hostname: ${hostname}`);
            }
            return sanitized;
        }

        throw new Error('Invalid repository URL format');
    }
}

function validateBranchName(branchName) {
    if (!branchName || typeof branchName !== 'string') {
        throw new Error('Branch name is required and must be a string');
    }

    const sanitized = branchName.trim();

    // Check for dangerous characters and git-specific invalid characters
    const invalidChars = /[;&|`$(){}[\]<>~^:?*\\\s]/;
    if (invalidChars.test(sanitized)) {
        throw new Error('Branch name contains invalid characters');
    }

    // Additional git branch name validation
    if (sanitized.startsWith('-') || sanitized.endsWith('.') || sanitized.includes('..')) {
        throw new Error('Invalid branch name format');
    }

    // Limit length to prevent buffer overflow attacks
    if (sanitized.length > 250) {
        throw new Error('Branch name too long');
    }

    return sanitized;
}

function validateRepoName(repoName) {
    if (!repoName || typeof repoName !== 'string') {
        throw new Error('Repository name is required and must be a string');
    }

    const sanitized = repoName.trim();

    // Only allow alphanumeric, hyphens, underscores, and dots
    const validPattern = /^[a-zA-Z0-9._-]+$/;
    if (!validPattern.test(sanitized)) {
        throw new Error('Repository name contains invalid characters');
    }

    // Prevent directory traversal
    if (sanitized.includes('..') || sanitized.startsWith('.')) {
        throw new Error('Invalid repository name format');
    }

    // Limit length
    if (sanitized.length > 100) {
        throw new Error('Repository name too long');
    }

    return sanitized;
}

function generateContainerName() {
    const projectName = path.basename(process.cwd()); // e.g., "my-project"
    const currentPath = process.cwd(); // e.g., "/home/user/projects/my-project"
    
    // Create SHA1 hash of the full path for uniqueness
    const pathHash = crypto.createHash('sha1').update(currentPath).digest('hex').substring(0, 8);
    
    // Sanitize project name (remove unsafe characters)
    const sanitizedName = projectName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    return `opencode-box-${sanitizedName}-${pathHash}`;
}

function checkRequirements(mode) {
    log.info('Checking system requirements...');

    // Check if Docker is installed and accessible
    try {
        const dockerVersion = execSync('docker --version', { encoding: 'utf8', timeout: 5000 });
        log.info(`Docker found: ${dockerVersion.trim()}`);
    } catch (error) {
        log.error('Docker is not installed, not in PATH, or not accessible');
        log.error('Please install Docker and ensure it\'s running');
        process.exit(1);
    }

    // Check Docker daemon is running
    try {
        execSync('docker info', { stdio: 'ignore', timeout: 5000 });
        log.info('Docker daemon is running');
    } catch (error) {
        log.error('Docker daemon is not running. Please start Docker');
        process.exit(1);
    }

    // Check if we're in a git repository
    try {
        execSync('git rev-parse --git-dir', { stdio: 'ignore', timeout: 5000 });
        log.info('Git repository detected');
    } catch (error) {
        log.error('Not in a git repository. Please run opencodebox from inside a git project.');
        process.exit(1);
    }

    // Only check SSH requirements for gitcheckout mode
    if (mode === '--gitcheckout') {
        // Check SSH agent or credentials
        if (!process.env.SSH_AUTH_SOCK) {
            log.error('SSH agent not found. Please start ssh-agent and add your SSH keys.');
            if (process.platform === 'darwin') {
                log.info('On macOS, try: eval "$(ssh-agent -s)" && ssh-add --apple-use-keychain ~/.ssh/id_rsa');
            } else {
                log.info('Run: eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_rsa');
            }
            log.info('Verify keys are loaded with: ssh-add -l');
            process.exit(1);
        }

        // Verify SSH agent is accessible
        try {
            if (!fs.existsSync(process.env.SSH_AUTH_SOCK)) {
                throw new Error('SSH socket does not exist');
            }
            log.info('SSH agent is accessible');
        } catch (error) {
            log.error(`SSH agent socket is not accessible: ${error.message}`);
            if (process.platform === 'darwin') {
                log.info('On macOS, SSH agent issues are common. Try restarting your terminal or running:');
                log.info('eval "$(ssh-agent -s)" && ssh-add --apple-use-keychain');
            } else {
                log.info('Try: eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_rsa');
            }
            log.info('Verify keys are loaded with: ssh-add -l');
            log.info('Test GitHub access with: ssh -T git@github.com');
            process.exit(1);
        }

        // Verify SSH agent has keys loaded
        try {
            const sshKeys = execSync('ssh-add -l', { encoding: 'utf8', timeout: 5000 });
            if (sshKeys.includes('no identities') || sshKeys.trim() === '') {
                throw new Error('No SSH keys loaded in agent');
            }
            log.info('SSH keys are loaded in agent');
        } catch (error) {
            log.error('SSH agent has no keys loaded');
            if (process.platform === 'darwin') {
                log.info('Add keys with: ssh-add --apple-use-keychain ~/.ssh/id_rsa');
            } else {
                log.info('Add keys with: ssh-add ~/.ssh/id_rsa');
            }
            log.info('Verify with: ssh-add -l');
            process.exit(1);
        }
    } else {
        log.info('SSH requirements skipped for mount mode');
    }

    log.success('All requirements satisfied');
}

function getRepoInfo() {
    try {
        // Get remote URL
        const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();

        // Get current branch
        const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();

        // Get repository name from URL
        const repoName = path.basename(remoteUrl, '.git');

        // Validate all inputs
        const validatedUrl = validateRepositoryUrl(remoteUrl);
        const validatedBranch = validateBranchName(currentBranch);
        const validatedName = validateRepoName(repoName);

        return {
            url: validatedUrl,
            name: validatedName,
            branch: validatedBranch
        };
    } catch (error) {
        log.error(`Failed to get repository information: ${error.message}`);
        process.exit(1);
    }
}

function buildDockerImage(forceRebuild = false) {
    const imageName = 'opencode-box';

    // If force rebuild is requested, remove existing image first
    if (forceRebuild) {
        log.info('Force rebuild requested, removing existing Docker image...');
        try {
            // Check if image exists and remove it
            const images = execSync(`docker images ${imageName} --format "{{.Repository}}"`, { encoding: 'utf8' });
            if (images.includes(imageName)) {
                log.info(`Removing existing Docker image '${imageName}'...`);
                execSync(`docker rmi ${imageName} --force`, { stdio: 'inherit' });
                log.success('Existing Docker image removed');
            } else {
                log.info(`No existing Docker image '${imageName}' found, proceeding with fresh build`);
            }
        } catch (error) {
            log.warning('Failed to remove existing Docker image, proceeding with build anyway');
        }
    }

    // Check if image exists (only if not forcing rebuild)
    if (!forceRebuild) {
        try {
            const images = execSync(`docker images ${imageName} --format "{{.Repository}}"`, { encoding: 'utf8' });
            if (images.includes(imageName)) {
                log.info(`Docker image '${imageName}' already exists, skipping build (use --rebuild to force rebuild)`);
                return;
            }
        } catch (error) {
            // Image doesn't exist, proceed with build
        }
    }

    log.info('Building Docker image...');
    try {
        const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
        const contextPath = path.dirname(dockerfilePath);

        execSync(`docker build -t ${imageName} "${contextPath}"`, {
            stdio: 'inherit',
            cwd: contextPath
        });
        log.success('Docker image built successfully');
    } catch (error) {
        log.error('Failed to build Docker image');
        process.exit(1);
    }
}

function findOpenCodeConfigs() {
    const homeDir = os.homedir();
    const potentialPaths = [
        path.join(homeDir, '.local', 'share', 'opencode'),
        path.join(homeDir, '.config', 'opencode'),
        path.join(homeDir, '.shared', 'opencode'), // Alternative path mentioned by user
        path.join(homeDir, '.opencode'),
        path.join(homeDir, '.local', 'opencode'),
        path.join(homeDir, '.config', 'opencode-ai')
    ];

    const foundConfigs = [];

    potentialPaths.forEach(configPath => {
        if (fs.existsSync(configPath)) {
            log.success(`Found OpenCode config at: ${configPath}`);
            foundConfigs.push(configPath);
        }
    });

    if (foundConfigs.length === 0) {
        log.warning('No OpenCode configuration directories found');
    }

    return {
        localShare: foundConfigs.find(p => p.includes('.local/share/opencode')),
        config: foundConfigs.find(p => p.includes('.config/opencode')),
        alternative: foundConfigs.find(p => p.includes('.shared/opencode')),
        all: foundConfigs
    };
} function runContainer(repoInfo, mode) {
    // Generate container name and timestamp for all modes
    let containerName;
    const timestamp = Date.now(); // Define timestamp for all modes
    
    if (mode === '--gitcheckout') {
        // Consistent name for gitcheckout (reusable)
        containerName = generateContainerName();
    } else {
        // Mount modes get timestamp for multiple instances
        const baseName = generateContainerName().replace(/-[^-]+$/, ''); // Remove existing hash
        containerName = `${baseName}-${timestamp}`;
    }

    log.info(`Starting container with secure credential forwarding in ${mode} mode...`);

    const dockerArgs = ['run', '-it']; // Always allocate TTY for OpenCode functionality
    
    // Add --rm for all modes to ensure automatic cleanup when container exits
    dockerArgs.push('--rm');  // --rm ensures automatic cleanup when container exits

    // Track if container was started for cleanup purposes
    let containerStarted = false;
    
    dockerArgs.push(
        '--name', containerName,
        // Security hardening
        '--security-opt', 'no-new-privileges:true',  // Prevent privilege escalation
        '--cap-drop', 'ALL',  // Drop all capabilities
        '--cap-add', 'DAC_OVERRIDE',  // Only add necessary capabilities for file access
        '--cap-add', 'SETGID',  // Add capability for SSH socket access
        '--cap-add', 'SETUID',  // Add capability for user switching if needed
        '--cap-add', 'CHOWN',   // Add capability for changing file ownership
        // Network security
        '--network', 'bridge'  // Use default bridge network
    );

    // Only add SSH configuration for gitcheckout mode
    if (mode === '--gitcheckout') {
        dockerArgs.push(
            // SSH and Git configuration - mount SSH socket and directory
            '-v', `${process.env.SSH_AUTH_SOCK}:/ssh-agent`,  // Mount to a predictable path
            '-e', 'SSH_AUTH_SOCK=/ssh-agent'  // Set the socket path inside container
        );
    }

    // Add environment variables (validated inputs)
    dockerArgs.push(
        '-e', `REPO_URL=${repoInfo.url}`,
        '-e', `REPO_NAME=${repoInfo.name}`,
        '-e', `REPO_BRANCH=${repoInfo.branch}`,
        '-e', `WORKSPACE_MODE=${mode}`  // Pass mode to entrypoint script
    );

    // SSH access is handled via SSH agent forwarding only
    // No SSH directory mounting for security reasons

    // Conditionally mount git config if it exists
    const gitConfig = path.join(os.homedir(), '.gitconfig');
    if (fs.existsSync(gitConfig)) {
        dockerArgs.push('-v', `${gitConfig}:/home/node/.gitconfig:ro`);
    }

    // Find and copy OpenCode config files from host to container
    const openCodeConfigs = findOpenCodeConfigs();

    // Mount host config directories as read-only so they can be copied inside container
    if (openCodeConfigs.localShare) {
        dockerArgs.push('-v', `${openCodeConfigs.localShare}:/tmp/host-opencode-local-share:ro`);
        dockerArgs.push('-e', 'HOST_OPENCODE_LOCAL_SHARE=/tmp/host-opencode-local-share');
        log.info(`Will copy OpenCode local/share config from: ${openCodeConfigs.localShare}`);
    }

    if (openCodeConfigs.config) {
        dockerArgs.push('-v', `${openCodeConfigs.config}:/tmp/host-opencode-config:ro`);
        dockerArgs.push('-e', 'HOST_OPENCODE_CONFIG=/tmp/host-opencode-config');
        log.info(`Will copy OpenCode config from: ${openCodeConfigs.config}`);
    }

    if (openCodeConfigs.all.length === 0) {
        log.warning('No OpenCode configurations found on host - container will start with default settings');
    }

    // Handle workspace mounting based on mode
    const currentDir = process.cwd();
    const stateVolume = `opencode-box-state-${timestamp}`;

    dockerArgs.push('-v', `${stateVolume}:/home/node/.local/state`);

    if (mode === '--mount-ro') {
        // Mount current directory as read-only
        dockerArgs.push('-v', `${currentDir}:/workspace:ro`);
        log.info(`Mounting workspace as read-only: ${currentDir}`);
        containerStarted = true; // Mark that container was started
    } else if (mode === '--mount-rw') {
        // Mount current directory as read-write
        dockerArgs.push('-v', `${currentDir}:/workspace:rw`);
        log.info(`Mounting workspace as read-write: ${currentDir}`);
        containerStarted = true; // Mark that container was started
    } else if (mode === '--gitcheckout') {
        // Use dedicated volume for git checkout mode (original behavior)
        const workspaceVolume = `opencode-box-workspace-${timestamp}`;
        dockerArgs.push('-v', `${workspaceVolume}:/workspace`);
        log.info('Using isolated workspace volume for git checkout');
        containerStarted = true; // Mark that container was started
    }

    // Add the image and command
    dockerArgs.push('opencode-box', '/app/entrypoint.sh');

    try {
        log.info(`Starting OpenCode environment...`);
        log.info(`Repository: ${repoInfo.name} (${repoInfo.branch})`);

        const child = spawn('docker', dockerArgs, {
            stdio: 'inherit',
            detached: false
        });

        child.on('exit', (code) => {
            if (code === 0) {
                log.success('OpenCode Box session completed successfully');
            } else {
                log.error(`OpenCode Box session ended with exit code ${code}`);
            }
            
            // Clean up temporary volumes (only if container was started)
            if (containerStarted) {
                const volumes = [stateVolume];
                
                // Add workspace volume only for gitcheckout mode
                if (mode === '--gitcheckout') {
                    volumes.push(workspaceVolume);
                }
                
                volumes.forEach(volume => {
                    try {
                        execSync(`docker volume rm ${volume}`, { stdio: 'pipe', timeout: 10000 });
                        log.info(`Cleaned up temporary volume: ${volume}`);
                    } catch (cleanupError) {
                        log.warning(`Failed to clean up volume ${volume}: ${cleanupError.message}`);
                    }
                });
            }

        });

        // Handle process termination gracefully
        process.on('SIGINT', () => {
            log.info('Received SIGINT, stopping container...');
            try {
                execSync(`docker stop ${containerName}`, { stdio: 'pipe', timeout: 10000 });
            } catch (stopError) {
                log.warning('Failed to stop container gracefully');
            }
        });

        process.on('SIGTERM', () => {
            log.info('Received SIGTERM, stopping container...');
            try {
                execSync(`docker stop ${containerName}`, { stdio: 'pipe', timeout: 10000 });
            } catch (stopError) {
                log.warning('Failed to stop container gracefully');
            }
        });
    } catch (error) {
        log.error('Failed to run container');
        console.error(error.message);
        process.exit(1);
    }
}

// Main execution
function main() {
    // Parse and validate arguments
    const args = parseArguments();
    
    // Handle help and version flags
    if (args.showHelp) {
        console.log(`
OpenCode Box - A secure Docker environment for AI-assisted development with OpenCode

Usage: opencodebox <mode> [options]

Modes (exactly one required):
  --mount-ro      Mount current workspace as read-only
  --mount-rw      Mount current workspace as read-write  
  --gitcheckout   Clone repository inside container (default behavior)

Other options:
  --it            Get interactive shell in existing gitcheckout container
  --rebuild       Force rebuild Docker image (removes existing image)
  --help, -h      Show this help message
  --version, -v   Show version information

Requirements:
  - Docker installed and running
  - Git repository (run from inside a git project)
  - SSH agent with credentials loaded (only for --gitcheckout mode)

Examples:
  cd /path/to/your/git/project
  opencodebox --mount-ro              # Mount workspace read-only
  opencodebox --mount-rw              # Mount workspace read-write
  opencodebox --gitcheckout           # Clone repo inside container
  opencodebox --gitcheckout --it       # Get interactive shell in existing container
  opencodebox --mount-ro --rebuild    # Force rebuild image and mount read-only

Mode Details:
  --mount-ro:  Directly mounts your current workspace into the container as read-only.
               Use this when you want to examine code without making changes.
               No SSH requirements - works with any git repository.
               
  --mount-rw:  Directly mounts your current workspace into the container as read-write.
               Use this when you want to modify files directly in your workspace.
               No SSH requirements - works with any git repository.
               
  --gitcheckout: Clones the repository inside the container using the current branch.
                This provides an isolated environment that doesn't affect your host files.
                Requires SSH agent with GitHub access for repository cloning.

Rebuild Option:
  --rebuild:   Forces removal and rebuild of the Docker image. This is useful when
                you want to update OpenCode or its dependencies to the latest versions.
                The existing image will be completely removed and rebuilt from scratch.
`);
        return;
    }

    if (args.showVersion) {
        console.log('opencodebox version 1.4.1');
        return;
    }

    // Set terminal title for better user experience
    const projectName = path.basename(process.cwd());
    const modeEmoji = args.mode === '--mount-ro' ? '🔒' : 
                     args.mode === '--mount-rw' ? '✏️' : 
                     args.mode === '--gitcheckout' ? '🐙' : '📦';
    
    // Set terminal title if supported
    if (process.platform === 'linux' && process.env.TERM) {
        try {
            execSync(`echo -ne "\\e]0;${modeEmoji} OpenCode Box: ${projectName} (${args.mode})\\a"`, { stdio: 'pipe' });
        } catch (error) {
            // Fallback if echo fails
        }
    }

    log.info(`Starting OpenCode Box in ${args.mode} mode...`);

    // Handle --it flag (exec into existing gitcheckout container)
    if (args.it && args.mode === '--gitcheckout') {
        const containerName = generateContainerName();
        
        // Check if container exists and is running
        try {
            const containerInfo = execSync(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`, { encoding: 'utf8' });
            if (containerInfo.includes(containerName)) {
                log.info(`Found existing container: ${containerName}`);
                log.info('Executing interactive shell in container...');
                execSync(`docker exec -it ${containerName} /bin/bash`, { stdio: 'inherit' });
                return;
            } else {
                log.error(`No running container found: ${containerName}`);
                log.info('Start a container first with: opencodebox --gitcheckout');
                process.exit(1);
            }
        } catch (error) {
            log.error('Failed to check for existing container');
            process.exit(1);
        }
    }

    // Check requirements
    checkRequirements(args.mode);

    // Get repository information (needed for all modes)
    const repoInfo = getRepoInfo();

    // Build Docker image if needed
    buildDockerImage(args.rebuild);

    // Run container
    runContainer(repoInfo, args.mode);
}

// Run the tool
main();
