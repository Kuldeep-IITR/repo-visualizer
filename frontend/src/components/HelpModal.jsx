import Modal from "./Modal";

export default function HelpModal({ onClose }) {
  return (
    <Modal title="How to read the map" onClose={onClose} width={640}>
      <section className="help">
        <h3>What you are looking at</h3>
        <ul>
          <li><b>Each card is a file.</b> The coloured left edge is its language, the number is its lines of code.</li>
          <li><b>Boxes are folders.</b> Files sit inside the folder they live in.</li>
          <li><b>Arrows are imports.</b> An arrow from A to B means <i>A imports B</i>. Only imports that point at a file inside the repository become arrows; packages like <code>react</code> or <code>os</code> are listed in the side panel instead.</li>
          <li><b>Red border</b> means a bloated file: over 500 lines of code or a complexity above 50. Worth a look before refactoring.</li>
          <li><b>Red dashed arrow</b> means a circular import: the files import each other, directly or through others.</li>
        </ul>

        <h3>Getting around</h3>
        <ul>
          <li><b>Click a file</b> to open its details. Everything unrelated fades so you can see what it depends on.</li>
          <li><b>Click a folder</b> in the left list or on the canvas to zoom to it.</li>
          <li><b>Drag</b> the background to pan, <b>scroll</b> to zoom, <b>drag a card</b> to move it. The fit button (⛶) in the bottom-left resets the view.</li>
          <li><b>Search</b> zooms to files whose path matches what you type.</li>
          <li><b>Hide isolated</b> removes files that neither import nor are imported by anything, which declutters big folders of scripts.</li>
          <li><b>Explain with AI</b> in the side panel asks Gemini for a 3-sentence summary. Results are cached, so a file is only sent again when its content changes.</li>
        </ul>

        <h3>Keyboard</h3>
        <ul className="shortcuts">
          <li><kbd>/</kbd> focus search</li>
          <li><kbd>Esc</kbd> close the side panel or dialog</li>
          <li><kbd>?</kbd> open this help</li>
        </ul>
      </section>
    </Modal>
  );
}
