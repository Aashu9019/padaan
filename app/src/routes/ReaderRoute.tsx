import { useParams } from 'react-router-dom';

export default function ReaderRoute() {
  const { bookId } = useParams();
  return <div className="p-6">{bookId}</div>;
}
