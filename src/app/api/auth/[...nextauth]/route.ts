import { handlers } from "@/lib/auth";

// next-auth v5 (Auth.js): the shared handlers the lib exports - the
// credentials flow the sign-in page and every E2E suite drive.
export const { GET, POST } = handlers;
