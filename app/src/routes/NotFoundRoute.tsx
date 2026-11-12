import { Link } from 'react-router-dom';

export default function NotFoundRoute() {
  return (
    <section className="py-16 text-center">
      <h1 className="font-serif text-2xl">Nothing on this page</h1>
      <Link to="/" className="mt-4 inline-block text-accent underline underline-offset-4">
        Back to the library
      </Link>
    </section>
  );
}
