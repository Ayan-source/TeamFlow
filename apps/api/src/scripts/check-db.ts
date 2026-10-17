import { prisma } from "../lib/prisma.js";

try {
  const profileCount = await prisma.profile.count();
  console.log(`Database connection OK. Profiles table is readable (${profileCount} rows).`);
} catch {
  console.error("Database check failed. Check DATABASE_URL, SSL settings, project status, and migrations.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
