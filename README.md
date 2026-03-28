# opencode-box

**A secure, containerized development environment for AI-assisted coding with OpenCode**

OpenCode Box provides an isolated Docker environment where you can safely work with AI-powered development tools while keeping your host system secure. It automatically sets up a complete development environment with your project, credentials, and OpenCode configurations.

## 🚀 Installation

Install OpenCode Box globally via NPM:

```bash
npm install -g opencode-box
```

## ⚡ Quick Start

1. **Navigate to any Git repository:**
   ```bash
   cd /path/to/your/git/project
   ```

2. **Launch OpenCode Box:**
   ```bash
   opencodebox
   ```

**That's it!** OpenCode Box will automatically:
- 🐳 Build the Docker image (if not already built)
- 🔐 Securely forward your SSH/Git credentials to the container
- ⚙️ Copy OpenCode configurations (`~/.local/share/opencode` and `~/.config/opencode`)
- 📂 Clone the current repository inside the container
- 🌿 Checkout to the current branch from your host machine
- 🤖 Start OpenCode in the isolated environment

## 🎛 Workspace Modes

OpenCode Box supports three different workspace modes to suit your needs:

### `--gitcheckout` (Default)
**Isolated development environment** - Clones repository inside container
```bash
opencodebox --gitcheckout
```
- ✅ Interactive terminal session
- 🔐 SSH credentials required
- 📦 Dedicated workspace volume
- 🔄 Automatic cleanup on exit

### `--mount-ro`
**Read-only workspace mounting** - Direct access to your current files
```bash
opencodebox --mount-ro
```
- 🔍 Code examination only
- 🚫 No file modifications allowed
- ⚡ No SSH requirements
- 📁 Direct workspace mounting

### `--mount-rw`
**Read-write workspace mounting** - Edit files directly in your workspace
```bash
opencodebox --mount-rw
```
- ✏️ Direct file editing
- 💾 Changes saved to host filesystem
- ⚡ No SSH requirements
- 📁 Direct workspace mounting

## 🛠️ Advanced Usage

### Container Management

**Interactive Shell Access**
Get a shell in an existing gitcheckout container for debugging:
```bash
opencodebox --gitcheckout --it
```

**Force Image Rebuild**
Update OpenCode and dependencies to latest versions:
```bash
opencodebox --gitcheckout --rebuild
```

**Multiple Mount Instances**
Run multiple containers with different workspaces:
```bash
# Terminal 1
cd ~/project-a
opencodebox --mount-ro

# Terminal 2  
cd ~/project-b
opencodebox --mount-rw
```

### Container Naming

**Consistent Naming for GitCheckout**
- Container name: `opencode-box-<project>-<path-hash>`
- Reusable across sessions
- Example: `opencode-box-my-app-a1b2c3d4`

**Unique Naming for Mount Modes**
- Container name: `opencode-box-<project>-<path-hash>-<timestamp>`
- Multiple instances allowed
- Example: `opencode-box-my-app-a1b2c3d4-1699123456789`

## 📋 Command Reference

### Modes (exactly one required)

| Mode | Description | SSH Required | Interactive | Container Name |
|-------|-------------|--------------|------------|----------------|
| `--gitcheckout` | Clone repository inside container | ✅ Yes | ✅ Yes | `opencode-box-<project>-<hash>` |
| `--mount-ro` | Mount workspace as read-only | ❌ No | ❌ No | `opencode-box-<project>-<hash>-<timestamp>` |
| `--mount-rw` | Mount workspace as read-write | ❌ No | ❌ No | `opencode-box-<project>-<hash>-<timestamp>` |

### Options

| Option | Description | Usage |
|---------|-------------|-------|
| `--it` | Get interactive shell in existing gitcheckout container | `opencodebox --gitcheckout --it` |
| `--rebuild` | Force rebuild Docker image (removes existing) | `opencodebox --gitcheckout --rebuild` |
| `--help, -h` | Show help message | `opencodebox --help` |
| `--version, -v` | Show version information | `opencodebox --version` |

### Usage Examples

```bash
# Basic usage
opencodebox --gitcheckout

# Read-only examination
opencodebox --mount-ro

# Direct editing
opencodebox --mount-rw

# Force rebuild with latest dependencies
opencodebox --gitcheckout --rebuild

# Get shell in running container
opencodebox --gitcheckout --it

# Multiple mount instances
opencodebox --mount-ro &  # Terminal 1
opencodebox --mount-rw      # Terminal 2

# Rebuild and mount
opencodebox --mount-ro --rebuild
```

## 📋 System Requirements

### Required Dependencies
- **Node.js**: v16.0.0 or higher
- **npm**: v7.0.0 or higher (comes with Node.js)
- **Docker**: v20.10.0 or higher (installed and running)
- **Git**: v2.25.0 or higher (configured on host machine)

### Authentication Requirements

**For `--gitcheckout` mode:**
- **SSH Agent**: Must be running with Git credentials loaded
- **Git Configuration**: User name and email configured globally
- **Repository Access**: Valid SSH key or credentials for target repository

**For `--mount-ro` and `--mount-rw` modes:**
- **No SSH Requirements**: Works with any local Git repository
- **Git Repository**: Must be run from inside a Git project
- **File System**: Direct access to your workspace files

### Optional but Recommended
- **OpenCode CLI**: Pre-installed on host machine for easier authentication setup
- **Docker Compose**: v2.0.0 or higher (for advanced configurations)

## 🔧 Prerequisites Setup

### SSH Agent Configuration

SSH agent is **required** for:
- 🔒 SSH-based Git URLs (`git@github.com:user/repo.git`)
- 🏠 Private repository access
- 🔑 SSH-authenticated Git operations

**Setup SSH Agent:**
```bash
# Start SSH agent
eval "$(ssh-agent -s)"

# Add your SSH key (replace with your key path)
ssh-add ~/.ssh/id_rsa

# Verify key is loaded
ssh-add -l
```

### Git Configuration Verification

Ensure Git is properly configured:
```bash
# Check current configuration
git config --global user.name
git config --global user.email

# Set if not configured
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Docker Setup Verification

Verify Docker is running:
```bash
# Check Docker status
docker --version
docker info

# Test Docker functionality
docker run hello-world
```

## 💡 Usage Examples

### Basic Usage
```bash
# Navigate to any Git project
cd ~/my-projects/react-app
opencodebox
```

### Advanced Scenarios
```bash
# Works with monorepos
cd ~/my-projects/large-monorepo
opencodebox

# Works with private repositories
cd ~/my-projects/private-enterprise-app
opencodebox

# Works with different Git providers
cd ~/my-projects/gitlab-project
opencodebox
```

## 🏗️ Container Architecture

The OpenCode Box container includes:
- **Base Image**: `node:20-alpine` (lightweight and secure)
- **OpenCode CLI**: Globally installed via `npm install -g opencode-ai`
- **Non-root User**: Secure user environment without sudo privileges
- **Isolated Network**: Container networking for security
- **Volume Mounts**: Project files and configuration directories

## 🔍 Troubleshooting

### Common Issues

**SSH Key Not Found:**
```bash
# Ensure SSH agent is running and key is added
ssh-add -l
```

**Docker Permission Denied:**
```bash
# Add user to docker group (Linux)
sudo usermod -aG docker $USER
# Then logout and login again
```

**Git Authentication Failed:**
```bash
# Test SSH connection to GitHub
ssh -T git@github.com
```

**OpenCode Configuration Missing:**
```bash
# Verify OpenCode config exists
ls -la ~/.config/opencode
ls -la ~/.local/share/opencode
```

**Container Not Found for `--it` Flag:**
```bash
# Error when trying to get shell in non-existent container
opencodebox --gitcheckout --it
# Solution: Start container first
opencodebox --gitcheckout
```

**Multiple Container Name Conflicts:**
```bash
# Check running containers with same project
docker ps --filter "name=opencode-box-my-project"
# Solution: Use different timestamps or stop existing container
docker stop opencode-box-my-project-a1b2c3d4
```

**Mount Mode Permission Issues:**
```bash
# Check file permissions on mounted workspace
ls -la /path/to/your/project
# Solution: Ensure proper ownership and permissions
sudo chown -R $USER:$USER /path/to/your/project
```

## 🚧 Roadmap

- [x] **Workspace Modes**: Implemented `--mount-ro`, `--mount-rw`, `--gitcheckout` modes
- [x] **Container Management**: Smart naming with project-based identifiers
- [x] **Interactive Shell Access**: `--it` flag for existing gitcheckout containers
- [x] **Resource Optimization**: Conditional TTY allocation and SSH mounting
- [ ] **Volume Mounting**: Mount specific local folders with absolute paths for document/image sharing
- [ ] **Multi-Platform Support**: Enhanced support for Windows and Linux environments
- [ ] **Performance Optimization**: Faster container startup and build times
