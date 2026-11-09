export default {
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/app',
  },
};

