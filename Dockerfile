FROM node:alpine

# Create app directory and set working directory
WORKDIR /app

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code
COPY . .

# Create log directories and set permissions
RUN mkdir -p logs/development logs/production && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Start the application
CMD ["npm", "start"] 