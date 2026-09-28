cmake_minimum_required(VERSION 3.18.1)

project("griot_pty")

add_library(
        griot_pty
        SHARED
        griot_pty.cpp
)

find_library(
        log-lib
        log
)

target_link_libraries(
        griot_pty
        ${log-lib}
)
