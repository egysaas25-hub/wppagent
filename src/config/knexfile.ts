import path from 'path';

export default {
  client: 'sqlite3',
  connection: {
    filename: path.resolve(__dirname, '../../data/database.db'),
  },
  migrations: {
    directory: path.resolve(__dirname, '../migrations'),
  },
  useNullAsDefault: true,
};