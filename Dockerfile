FROM node:trixie

# Install dependencies in one layer
RUN apt update && apt install -y \
    git \
    bash \
    openssh-client \
    curl \
    ca-certificates \
    file \
    build-essential \
    cmake \
    python3 python3-pip \
    golang-1.24 \
    lsof \
    net-tools \
    curl \
    tcpdump \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="$PATH:/usr/lib/go-1.24/bin"

# Create workspace directory with proper ownership
RUN mkdir -p /workspace && chown node:node /workspace

# Create SSH directory with proper permissions for default user (node)
RUN mkdir -p /home/node/.ssh && \
    chown node:node /home/node/.ssh && \
    chmod 700 /home/node/.ssh

# Install sudo for permission fixes (will be used sparingly in entrypoint)
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/* && \
    echo "node ALL=(root) NOPASSWD: /bin/chown, /bin/chmod, /usr/bin/groups, /usr/sbin/usermod, /usr/bin/newgrp" > /etc/sudoers.d/node

# Configure SSH for GitHub with proper host key verification
RUN echo "Host github.com" > /home/node/.ssh/config && \
    echo "  HostName github.com" >> /home/node/.ssh/config && \
    echo "  User git" >> /home/node/.ssh/config && \
    echo "  StrictHostKeyChecking yes" >> /home/node/.ssh/config && \
    echo "  UserKnownHostsFile /home/node/.ssh/known_hosts" >> /home/node/.ssh/config && \
    chown node:node /home/node/.ssh/config && \
    chmod 600 /home/node/.ssh/config

# Add GitHub's official SSH host keys for security
RUN echo "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > /home/node/.ssh/known_hosts && \
    echo "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=" >> /home/node/.ssh/known_hosts && \
    echo "github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=" >> /home/node/.ssh/known_hosts && \
    chown node:node /home/node/.ssh/known_hosts && \
    chmod 644 /home/node/.ssh/known_hosts

WORKDIR /app

# Install OpenCode globally as specified in AGENT.md
RUN npm install -g opencode-ai

# Copy entrypoint script and set ownership
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown node:node /app/entrypoint.sh

# Create OpenCode directories with proper ownership
# Note: Configurations are managed at runtime via volumes, not copied during build
RUN mkdir -p /home/node/.local/share/opencode && \
    mkdir -p /home/node/.local/state && \
    mkdir -p /home/node/.config/opencode && \
    chown -R node:node /home/node/.local && \
    chown -R node:node /home/node/.config

# Switch to non-root user (using default node user)
USER node

# Set default working directory to workspace
WORKDIR /workspace

CMD ["tail", "-f", "/dev/null"]
