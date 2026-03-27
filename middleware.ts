import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
    '/dashboard(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
    const url = new URL(req.url);
    if (isProtectedRoute(req)) {
        console.log(`🛡️ Middleware: Protecting route ${url.pathname}`);
        try {
            auth().protect();
            console.log(`✅ Middleware: Auth approved for ${url.pathname}`);
        } catch (err) {
            console.error(`❌ Middleware: Auth FAILED for ${url.pathname}. Redirecting...`);
            throw err;
        }
    } else {
        console.log(`🔓 Middleware: Public route ${url.pathname}`);
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
