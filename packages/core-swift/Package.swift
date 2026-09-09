// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RajioCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "RajioCore", targets: ["RajioCore"])],
    targets: [
        .systemLibrary(name: "CRajioCore"),
        .target(name: "RajioCore", dependencies: ["CRajioCore"]),
        .testTarget(name: "RajioCoreTests", dependencies: ["RajioCore"]),
    ]
)
