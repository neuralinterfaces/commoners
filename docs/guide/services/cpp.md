# Example Compiled Service
This is an example HTTP server written in C++.

```cpp
#ifdef _WIN32
    #include <winsock2.h> // For Windows socket functions
    #include <ws2tcpip.h> // For inet_pton, etc.
    #pragma comment(lib, "ws2_32.lib") // Link with ws2_32.lib
    typedef int socklen_t;
    #define close closesocket
    #define read_recv(s, b, l) recv(s, b, l, 0) // Windows uses recv
#else
    #include <sys/socket.h> // For socket functions
    #include <netinet/in.h> // For sockaddr_in
    #include <arpa/inet.h>  // For inet_pton, etc.
    #include <unistd.h>     // For read, close
    #define read_recv(s, b, l) read(s, b, l) // Unix-like systems use read
#endif

#include <cstdlib>   // For exit() and EXIT_FAILURE
#include <iostream>  // For cout
#include <string>    // For string
#include <sstream>   // For stringstream

std::string handleGetRequest() {
    std::stringstream httpResponse;
    const char* secretvariable = std::getenv("SECRET_VARIABLE");
    httpResponse << "HTTP/1.1 200 OK\r\n"
                 << "Content-Type: text/plain\r\n"
                 << "Access-Control-Allow-Origin: *\r\n"
                 << "\r\n"
                 << (secretvariable ? secretvariable : "");
    return httpResponse.str();
}

std::string handlePostRequest(const std::string& postData, const std::string& contentType) {
    std::stringstream httpResponse;
    httpResponse << "HTTP/1.1 200 OK\r\n"
                 << "Content-Type: " << contentType << "\r\n"
                 << "Access-Control-Allow-Origin: *\r\n"
                 << "\r\n" << postData;
    return httpResponse.str();
}

int main() {
    #ifdef _WIN32
    WSADATA wsaData;
    int wsaResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (wsaResult != 0) {
        std::cerr << "WSAStartup failed: " << wsaResult << std::endl;
        exit(EXIT_FAILURE);
    }
    #endif

    const char* envPort = std::getenv("PORT");
    int port = envPort ? std::atoi(envPort) : 8080;

    const char* host = std::getenv("HOST");
    std::cout << "Starting server on http://" << (host ? host : "0.0.0.0") << ":" << port << std::endl;

    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd == -1) {
        #ifdef _WIN32
        std::cerr << "Failed to create socket. WSA error: " << WSAGetLastError() << std::endl;
        #else
        std::cerr << "Failed to create socket. errno: " << errno << std::endl;
        #endif
        exit(EXIT_FAILURE);
    }

    int opt = 1;
    if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt)) < 0) {
        #ifdef _WIN32
        std::cerr << "Failed to set SO_REUSEADDR. WSA error: " << WSAGetLastError() << std::endl;
        #else
        std::cerr << "Failed to set SO_REUSEADDR. errno: " << errno << std::endl;
        #endif
        exit(EXIT_FAILURE);
    }

    sockaddr_in sockaddr;
    sockaddr.sin_family = AF_INET;
    sockaddr.sin_addr.s_addr = INADDR_ANY; 
    sockaddr.sin_port = htons(port);

    if (bind(sockfd, (struct sockaddr*)&sockaddr, sizeof(sockaddr)) < 0) {
        #ifdef _WIN32
        std::cerr << "Failed to bind to port " << port << ". WSA error: " << WSAGetLastError() << std::endl;
        #else
        std::cerr << "Failed to bind to port " << port << ". errno: " << errno << std::endl;
        #endif
        exit(EXIT_FAILURE);
    }

    if (listen(sockfd, 10) < 0) {
        #ifdef _WIN32
        std::cerr << "Failed to listen on socket. WSA error: " << WSAGetLastError() << std::endl;
        #else
        std::cerr << "Failed to listen on socket. errno: " << errno << std::endl;
        #endif
        exit(EXIT_FAILURE);
    }

    while (true) {
        auto addrlen = sizeof(sockaddr);
        int connection = accept(sockfd, (struct sockaddr*)&sockaddr, (socklen_t*)&addrlen);
        if (connection < 0) {
            #ifdef _WIN32
            std::cerr << "Failed to grab connection. WSA error: " << WSAGetLastError() << std::endl;
            #else
            std::cerr << "Failed to grab connection. errno: " << errno << std::endl;
            #endif
            exit(EXIT_FAILURE);
        }

        char buffer[1024] = {0};
        read_recv(connection, buffer, 1024);

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

            std::string contentType = "application/octet-stream"; 
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

    #ifdef _WIN32
    WSACleanup();
    #endif

    return 0;
}
```