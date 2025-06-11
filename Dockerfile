FROM nginx:latest

# Copy the custom index.html to the nginx html directory
COPY index.html /usr/share/nginx/html/index.html

# Expose port 80
EXPOSE 80 