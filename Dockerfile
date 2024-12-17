FROM node:alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Create log directories
RUN mkdir -p logs/development logs/production

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 