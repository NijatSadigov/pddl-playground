import './CompileInfo.css';

interface Props {
  enabled: boolean;
}

// Explains the negative-precondition compiler for the in-browser engine: what the
// "Compile negative preconditions" toggle does and how the rewrite works. Shown
// as a collapsible panel so it is available without crowding the toolbar.
export function CompileInfo({ enabled }: Props) {
  return (
    <details className="compile-info">
      <summary>
        How does “Compile negative preconditions” work?
        <span className={`ci-state ci-${enabled ? 'on' : 'off'}`}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </summary>
      <div className="ci-body">
        <p>
          The in-browser planner, <code>pyperplan</code>, solves the{' '}
          <strong>STRIPS + typing</strong> subset with{' '}
          <strong>positive preconditions only</strong>. It cannot read a negated
          precondition such as <code>(not (obstacle-at ?to))</code>, or a negated
          goal. The original MineField domain uses{' '}
          <code>:negative-preconditions</code>, so pyperplan would reject it as-is.
        </p>

        <p>
          <strong>The toggle.</strong> When it is <strong>ON</strong> (the
          default), the app rewrites the domain and problem into an equivalent{' '}
          <em>positive normal form</em> before handing them to the solver — the
          editors keep your original text; only the solver sees the rewrite. When
          it is <strong>OFF</strong>, the sources go to pyperplan unchanged, so a
          domain with negative preconditions will fail to solve (switch it off to
          see that error, or use the <strong>Server</strong> engine, which
          supports negative preconditions natively).
        </p>

        <p>The rewrite has four steps:</p>
        <ol className="ci-steps">
          <li>
            For each predicate <code>P</code> that appears negated, declare a
            complementary predicate <code>not-P</code> meaning “<code>P</code> is
            false”.
          </li>
          <li>
            Replace every <code>(not (P …))</code> in a precondition or goal with
            the positive <code>(not-P …)</code>.
          </li>
          <li>
            Complete the start state under the{' '}
            <strong>closed-world assumption</strong>: add <code>(not-P x)</code>{' '}
            for every object tuple where <code>(P x)</code> is not listed as true
            initially.
          </li>
          <li>
            Keep the pair consistent in effects: an effect that adds{' '}
            <code>(P x)</code> also deletes <code>(not-P x)</code>, and one that
            deletes <code>(P x)</code> also adds <code>(not-P x)</code>.
          </li>
        </ol>

        <div className="ci-example">
          <div className="ci-ex-col">
            <span className="ci-ex-tag">original (rejected)</span>
            <pre>{`(:precondition
  (and (adjacent ?from ?to)
       (not (obstacle-at ?to))))`}</pre>
          </div>
          <div className="ci-ex-arrow">→</div>
          <div className="ci-ex-col">
            <span className="ci-ex-tag">compiled (solvable)</span>
            <pre>{`(:precondition
  (and (adjacent ?from ?to)
       (not-obstacle-at ?to)))`}</pre>
          </div>
        </div>

        <p className="ci-foot">
          A <em>delete effect</em> such as <code>(not (at ?r ?from))</code> is
          ordinary STRIPS and is left untouched — only negative{' '}
          <strong>preconditions and goals</strong> are rewritten. The same idea
          (translate a hard feature into something the planner can solve) powers
          the epistemic engine.
        </p>
      </div>
    </details>
  );
}
