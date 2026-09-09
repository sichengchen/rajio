// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "RajioLibrary",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "RajioLibrary", targets: ["RajioLibrary"])],
    dependencies: [
        .package(path: "../core-swift"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "7.8.0"),
    ],
    targets: [
        .target(name: "RajioLibrary", dependencies: [
            .product(name: "RajioCore", package: "core-swift"),
            .product(name: "GRDB", package: "GRDB.swift"),
        ]),
        .testTarget(name: "RajioLibraryTests", dependencies: ["RajioLibrary"]),
    ]
)
