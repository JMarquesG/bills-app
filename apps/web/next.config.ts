import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
	// Point Turbopack to the monorepo root to avoid wrong lockfile root
	turbopack: {
		root: path.resolve(__dirname, "../../.."),
	},
};

export default nextConfig;
