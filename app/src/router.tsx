import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import LibraryRoute from './routes/LibraryRoute';
import AddRoute from './routes/AddRoute';
import ReaderRoute from './routes/ReaderRoute';
import SettingsRoute from './routes/SettingsRoute';
import NotFoundRoute from './routes/NotFoundRoute';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <LibraryRoute /> },
      { path: '/add', element: <AddRoute /> },
      { path: '/settings', element: <SettingsRoute /> },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
  { path: '/read/:bookId', element: <ReaderRoute /> },
]);
