import {h, VNode} from 'preact';
import {useEffect, useState} from 'preact/hooks';

interface PaginatedContentProps {
  itemsPerPage: number;
  items: any[];
  renderItems: (items: any[]) => VNode;
}

export const PaginatedContent = (props: PaginatedContentProps) => {
  const {itemsPerPage, items, renderItems} = props;
  const [currentPage, setCurrentPage] = useState(0);
  useEffect(() => {
    setCurrentPage(0);
  }, [items]);

  const numPages = Math.ceil(items.length / itemsPerPage);
  const startIndex = itemsPerPage * currentPage;
  const paginatedItems = items.slice(startIndex, startIndex + itemsPerPage);

  return <div>
    <button disabled={currentPage === 0} onClick={() => setCurrentPage(currentPage - 1)}>{'<'}</button>
    <button disabled={currentPage === numPages - 1} onClick={() => setCurrentPage(currentPage + 1)}>{'>'}</button>
    page {currentPage + 1} of {numPages}
    {renderItems(paginatedItems)}
  </div>;
};
