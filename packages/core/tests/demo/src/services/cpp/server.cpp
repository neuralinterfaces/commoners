#include <sys/socket.h> // For socket functions
#include <netinet/in.h> // For sockaddr_in
#include <cstdlib> // For exit() and EXIT_FAILURE
#include <arpa/inet.h> // For inet_addr
#include <iostream> // For cout
#include <fstream> // For ifstream
#include <sstream> // For stringstream
#include <unistd.h> // For read
#include <string> // For string
#include <map> // For map

std::string handleGetRequest() {
    std::stringstream httpResponse;

    httpResponse << "HTTP/1.1 200 OK\r\n"
                 "Content-Type: text/plain\r\n"
                 "Access-Control-Allow-Origin: *\r\n"
                 "\r\nHello World";

    return httpResponse.str();
}

std::string handlePostRequest(std::string postData, const std::string& contentType) {
    std::stringstream httpResponse;

    httpResponse << "HTTP/1.1 200 OK\r\n"
                 << "Content-Type: " << contentType << "\r\n"
                 "Access-Control-Allow-Origin: *\r\n"
                 "\r\n" << postData;

    return httpResponse.str();
}

int main() {
    const char* envPort = std::getenv("PORT");
    int port = envPort ? std::atoi(envPort) : 8080;

    const char* host = std::getenv("HOST");
    in_addr_t inAddr = host ? inet_addr(host) : INADDR_ANY;
    std::cout << "Starting server on http://" << (host ? host : "0.0.0.0") << ":" << port << std::endl;

    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd == -1) {
        std::cout << "Failed to create socket. errno: " << errno << std::endl;
        exit(EXIT_FAILURE);
    }

    int opt = 1;
    if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        std::cout << "Failed to set SO_REUSEADDR. errno: " << errno << std::endl;
        exit(EXIT_FAILURE);
    }

    sockaddr_in sockaddr;
    sockaddr.sin_family = AF_INET;
    sockaddr.sin_addr.s_addr = INADDR_ANY;
    sockaddr.sin_port = htons(port);
    if (bind(sockfd, (struct sockaddr*)&sockaddr, sizeof(sockaddr)) < 0) {
        std::cout << "Failed to bind to port " << port << ". errno: " << errno << std::endl;
        exit(EXIT_FAILURE);
    }

    if (listen(sockfd, 10) < 0) {
        std::cout << "Failed to listen on socket. errno: " << errno << std::endl;
        exit(EXIT_FAILURE);
    }

    while (true) {
        auto addrlen = sizeof(sockaddr);
        int connection = accept(sockfd, (struct sockaddr*)&sockaddr, (socklen_t*)&addrlen);
        if (connection < 0) {
            std::cout << "Failed to grab connection. errno: " << errno << std::endl;
            exit(EXIT_FAILURE);
        }

        char buffer[1024] = {0};
        read(connection, buffer, 1024);

        std::string request(buffer);
        std::string response;

        if (request.find("GET") != std::string::npos) {
            response = handleGetRequest();
        } else if (request.find("POST") != std::string::npos) {
            auto pos = request.find("\r\n\r\n");
            std::string postData;
            if (pos != std::string::npos) {
                postData = request.substr(pos + 4);
            }

            std::string contentType = "application/octet-stream"; // Default content type
            pos = request.find("Content-Type: ");
            if (pos != std::string::npos) {
                auto end = request.find("\r\n", pos);
                contentType = request.substr(pos + 14, end - pos - 14);
            }

            response = handlePostRequest(postData, contentType);
        }

        send(connection, response.c_str(), response.length(), 0);

        close(connection);
    }

    return 0;
}
