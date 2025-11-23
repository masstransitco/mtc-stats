export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-6 py-8 mt-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 md:flex-row md:justify-between md:items-start">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Data Sources</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Data provided by the Hong Kong Special Administrative Region Government.
              Contains information licensed under the{' '}
              <a
                href="https://data.gov.hk/en/terms-and-conditions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Open Data License
              </a>.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Sources include: Transport Department, Immigration Department,
              and Hong Kong Tourism Board.
            </p>
          </div>

          <div className="flex-1 md:text-right">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">About</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              A product of{' '}
              <span className="font-medium text-slate-900">
                Aircity Operating System (HK) Ltd
              </span>
            </p>
            <p className="text-xs text-slate-500 mt-2">
              © {new Date().getFullYear()} All rights reserved
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <p className="text-xs text-slate-500 text-center">
            This platform provides analytical insights on Hong Kong mobility patterns.
            Data is provided as-is without warranty.
          </p>
        </div>
      </div>
    </footer>
  );
}
