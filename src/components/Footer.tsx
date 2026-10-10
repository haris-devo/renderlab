import './footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div>
          <strong>renderlab</strong>
          <p>
            An interactive lab for frontend rendering strategies. The first of a series on frontend system design.
          </p>
        </div>
        <ul>
          <li>
            <a href="https://github.com/haris-devo/renderlab" target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
          </li>
          <li>
            <a href="https://github.com/haris-devo" target="_blank" rel="noreferrer">
              Built by Haris Ahmed
            </a>
          </li>
          <li>Set in Google Sans Flex and Google Sans Code, under the SIL Open Font License.</li>
        </ul>
      </div>
    </footer>
  );
}
