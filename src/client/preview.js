import {FileAttachment, registerFile} from "npm:@observablehq/stdlib";
import {main, runtime, undefine} from "./main.js";
import {enableCopyButtons} from "./pre.js";

export * from "./index.js";

let minReopenDelay = 1000;
let maxReopenDelay = 30000;
let reopenDelay = minReopenDelay;
let reopenDecay = 1.1; // exponential backoff factor

export function open({hash, eval: compile} = {}) {
  let opened = false;
  const socket = new WebSocket(
    Object.assign(new URL("/_observablehq", location.href), {
      protocol: location.protocol === "https:" ? "wss" : "ws"
    })
  );

  socket.onopen = () => {
    console.info("socket open");
    opened = true;
    reopenDelay = minReopenDelay;
    send({type: "hello", path: location.pathname, hash});
  };

  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    console.info("↓", message);
    switch (message.type) {
      case "reload": {
        location.reload();
        break;
      }
      case "update": {
        const root = document.querySelector("main");
        if (message.hash.previous !== hash) {
          console.log("contents out of sync");
          location.reload();
          break;
        }
        hash = message.hash.current;
        let offset = 0;
        const addedCells = new Map();
        const removedCells = new Map();
        for (const {type, oldPos, items} of message.html) {
          switch (type) {
            case "add": {
              for (const item of items) {
                const pos = oldPos + offset;
                if (pos < root.children.length) {
                  root.children[pos].insertAdjacentHTML("beforebegin", item);
                } else {
                  root.insertAdjacentHTML("beforeend", item);
                }
                indexCells(addedCells, root.children[pos]);
                ++offset;
              }
              break;
            }
            case "remove": {
              let removes = 0;
              for (let i = 0; i < items.length; ++i) {
                const pos = oldPos + offset;
                if (pos < root.children.length) {
                  const child = root.children[pos];
                  indexCells(removedCells, child);
                  child.remove();
                  ++removes;
                } else {
                  console.error(`remove out of range: ${pos} ≮ ${root.children.length}`);
                }
              }
              offset -= removes;
              break;
            }
          }
        }
        for (const [id, removed] of removedCells) {
          addedCells.get(id)?.replaceWith(removed);
        }
        for (const id of message.code.removed) {
          undefine(id);
        }
        for (const body of message.code.added) {
          compile(body);
        }
        for (const name of message.files.removed) {
          registerFile(name, null);
        }
        for (const file of message.files.added) {
          registerFile(file.name, file);
        }
        if (message.tables.removed.length || message.tables.added.length) {
          const {registerTable} = await import("npm:@observablehq/duckdb");
          for (const name of message.tables.removed) {
            registerTable(name, null);
          }
          for (const table of message.tables.added) {
            registerTable(table.name, !/^(\w+:|#)/.test(table.path) ? FileAttachment(table.path) : table.path);
          }
        }
        if (message.tables.removed.length || message.tables.added.length) {
          const sql = main._resolve("sql");
          runtime._updates.add(sql); // re-evaluate sql code
          runtime._compute();
          const vg = runtime._builtin._resolve("vg");
          vg.define("vg", [], vg._definition); // reload vgplot, then re-evaluate vg code
        }
        if (message.stylesheets.added.length === 1 && message.stylesheets.removed.length === 1) {
          const [newHref] = message.stylesheets.added;
          const [oldHref] = message.stylesheets.removed;
          const link = document.head.querySelector(`link[rel="stylesheet"][href="${oldHref}"]`);
          link.href = newHref;
        } else {
          for (const href of message.stylesheets.added) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.crossOrigin = "";
            link.href = href;
            document.head.appendChild(link);
          }
          for (const href of message.stylesheets.removed) {
            document.head.querySelector(`link[rel="stylesheet"][href="${href}"]`)?.remove();
          }
        }
        enableCopyButtons();
        break;
      }
    }
  };

  socket.onclose = () => {
    if (opened) console.info("socket close");
    reopenDelay = Math.min(maxReopenDelay, reopenDelay * reopenDecay); // exponential backoff
    setTimeout(() => open({hash, eval: compile}), reopenDelay);
  };

  function indexCells(map, node) {
    if (node.id.startsWith("cell-")) {
      map.set(node.id, node);
    }
    for (const cell of node.querySelectorAll("[id^=cell-]")) {
      map.set(cell.id, cell);
    }
  }

  function send(message) {
    console.info("↑", message);
    socket.send(JSON.stringify(message));
  }
}
