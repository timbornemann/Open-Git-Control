const assert = require('node:assert/strict');
module.exports = async function verifySchemaLayout(parent, contents, waitFor) {
  for (const width of [900, 600, 900]) {
    parent.setSize(width, 640);
    try {
      await waitFor(contents, `innerWidth<=${width}&&innerWidth>${width - 40}`, 'Schema viewport at ' + width);
      await waitFor(
        contents,
        `(()=>{const coach=document.querySelector('.tutorial-coach').getBoundingClientRect();const field=document.querySelector('[data-dialog-field="schema"] textarea'),r=field.getBoundingClientRect(),clip=field.closest('.dialog-content').getBoundingClientRect();return r.top>=clip.top&&r.bottom<=clip.bottom&&[...document.querySelectorAll('.tutorial-coach button')].every(node=>{const r=node.getBoundingClientRect();return r.top>=coach.top&&r.bottom<=coach.bottom&&r.left>=0&&r.right<=innerWidth;});})()`,
        'Reachable schema field and coach controls at ' + width,
      );
      assert.equal(await contents.executeJavaScript('getComputedStyle(document.querySelector("#tutorial-step-description")).whiteSpace'), 'pre-wrap');
    } catch (error) {
      console.error(
        'Schema resize state:',
        JSON.stringify({
          requested: width,
          visible: parent.isVisible(),
          bounds: parent.getBounds(),
          content: parent.getContentBounds(),
          children: parent.contentView.children.map((view) => view.getBounds()),
        }),
      );
      throw error;
    }
  }
};
