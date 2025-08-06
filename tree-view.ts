import {
  App,
  ItemView,
  WorkspaceLeaf,
  Modal,
  TFolder,
  TFile,
  TAbstractFile,
} from "obsidian";

export const VIEW_TYPE_TREE = "tree-navigator-view";

interface Node {
  file: TAbstractFile;
  depth: number;
  expanded: boolean;
  parent?: Node;
  domEl?: HTMLDivElement;
}

export class TreeView extends ItemView {
  private nodes: Node[] = [];
  private selectedIndex = 0;
  private container!: HTMLElement;
  private expandedMap = new Map<string, boolean>();

  constructor(leaf: WorkspaceLeaf, private toggleCallback: () => void) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_TREE;
  }

  getDisplayText() {
    return "Tree Navigator";
  }

  focusContainer() {
    this.containerEl.tabIndex = 0;
    this.containerEl.focus();
  }

  focusFirstItem() {
    const first = this.container.querySelector(".tree-item") as HTMLElement;
    first?.focus();
  }

  async onOpen() {
    this.container = this.containerEl.children[1] as HTMLElement;
    this.container.empty();

    await this.buildTree();
    this.render();

    this.registerDomEvent(
      this.containerEl,
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key === "n" && e.altKey) {
          this.toggleCallback();
          e.preventDefault();
          return;
        }
        this.onKey(e);
      }
    );

    this.containerEl.tabIndex = 0;
    this.containerEl.focus();
  }

  private async buildTree() {
    this.nodes = [];
    const root = this.app.vault.getRoot();

    const walk = (folder: TFolder, depth = 0, parent?: Node) => {
      const isExpanded = this.expandedMap.get(folder.path) ?? depth === 0;
      const folderNode: Node = { file: folder, depth, expanded: isExpanded, parent };
      this.nodes.push(folderNode);

      if (isExpanded) {
        folder.children
          .sort((a, b) => {
            if (a instanceof TFolder && b instanceof TFile) return -1;
            if (a instanceof TFile && b instanceof TFolder) return 1;
            return a.name.localeCompare(b.name);
          })
          .forEach((child) => {
            if (child instanceof TFolder) {
              walk(child, depth + 1, folderNode);
            } else {
              this.nodes.push({
                file: child,
                depth: depth + 1,
                expanded: false,
                parent: folderNode,
              });
            }
          });
      }
    };

    // Start by iterating over root's children, skipping the vault-root entry:
    root.children
      .sort((a, b) => {
        if (a instanceof TFolder && b instanceof TFile) return -1;
        if (a instanceof TFile && b instanceof TFolder) return 1;
        return a.name.localeCompare(b.name);
      })
      .forEach((child) => {
        if (child instanceof TFolder) {
          walk(child, 0);
        } else {
          this.nodes.push({ file: child, depth: 0, expanded: false });
        }
      });
  }

  private render() {
    this.container.empty();

    this.nodes.forEach((node, idx) => {
      const isFolder = node.file instanceof TFolder;
      const wrapper = this.container.createDiv(`tree-item ${isFolder ? "folder" : "file"}`);
      node.domEl = wrapper;
      wrapper.style.paddingLeft = `${node.depth * 1}rem`;

      if (isFolder) {
        wrapper.toggleClass("expanded", node.expanded);
        wrapper.toggleClass("collapsed", !node.expanded);

        const folderEl = wrapper.createDiv("nav-folder-title");
        folderEl.createSpan({
          cls: "nav-folder-collapse-icon",
          attr: { "aria-hidden": "true" },
        });
        folderEl.createSpan({ cls: "tree-icon mod-folder" });
        folderEl.createDiv({
          cls: "nav-folder-title-content",
          text: node.file.name,
        });
      } else {
        const fileEl = wrapper.createDiv("nav-file-title");
        fileEl.createSpan({ cls: "tree-icon mod-document" });
        fileEl.createDiv({
          cls: "nav-file-title-content",
          text: node.file.name,
        });
      }

      if (idx === this.selectedIndex) {
        wrapper.addClass("selected-tree-item");
        wrapper.scrollIntoView({ block: "nearest" });
      }

      wrapper.onclick = () => this.selectNode(idx);
    });
  }

  private onKey(e: KeyboardEvent) {
    switch (e.key) {
      case "j":
      case "ArrowDown":
        this.moveCursor(1);
        break;
      case "k":
      case "ArrowUp":
        this.moveCursor(-1);
        break;
      case "l":
      case "o":
      case "Enter":
        this.collapseOrExpand();
        break;
      case "h":
        this.collapseOrExpand();
        break;
      case "a":
        this.createPrompt();
        break;
      case "d":
        this.deletePrompt();
        break;
      case "r":
        this.renamePrompt();
        break;
      case "R":
        this.refresh();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private selectNode(idx: number) {
    this.selectedIndex = idx;
    this.render();
  }

  private moveCursor(delta: number) {
    const max = this.nodes.length - 1;
    this.selectedIndex = Math.max(0, Math.min(max, this.selectedIndex + delta));
    this.render();
  }

  /**
   * Collapse this folder and all of its descendant folders.
   */
  private collapseRecursively(folder: TFolder) {
    this.expandedMap.set(folder.path, false);
    folder.children.forEach((child) => {
      if (child instanceof TFolder) {
        this.collapseRecursively(child);
      }
    });
  }

  /**
   * Toggle expand/collapse on folders (collapsing recursively)
   * or open files.
   */
  private async collapseOrExpand() {
    const node = this.nodes[this.selectedIndex];

    // Folder → expand or collapse
    if (node.file instanceof TFolder) {
      const path = node.file.path;
      const isExpanded = this.expandedMap.get(path) ?? false;

      if (isExpanded) {
        // Collapse this folder and all descendants
        this.collapseRecursively(node.file);
      } else {
        // Only expand this one
        this.expandedMap.set(path, true);
      }

      await this.buildTree();
      this.render();
    }
    // File → open it
    else {
      await this.app.workspace.openLinkText(node.file.path, "", false);
    }
  }

  private async createPrompt() {
    const node = this.nodes[this.selectedIndex];
    const parentPath =
      node.file instanceof TFolder
        ? node.file.path
        : node.file.parent?.path ?? "";

    const name = await new TextPromptModal(this.app, "New file/folder name")
      .openAndGetValue();
    if (!name) return;

    if (name.endsWith("/")) {
      // Folder
      await this.app.vault.createFolder(`${parentPath}/${name.slice(0, -1)}`);
    } else {
      // File: ensure a .md extension
      const fileName = name.includes(".")
        ? name
        : `${name}.md`;
      await this.app.vault.create(`${parentPath}/${fileName}`, "");
    }
      await this.refresh();
    }

  private async deletePrompt() {
    const node = this.nodes[this.selectedIndex];
    const confirmed = await new ConfirmationModal(
      this.app,
      `Delete "${node.file.name}"?`
    ).openAndGetValue();
    if (!confirmed) return;

    await this.app.vault.delete(node.file);
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    await this.refresh();
  }

  private async renamePrompt() {
    const node = this.nodes[this.selectedIndex];
    const parentPath = node.file.parent?.path ?? "";

    const newName = await new TextPromptModal(
      this.app,
      "Rename to:",
      node.file.name
    ).openAndGetValue();
    if (!newName) return;

    await this.app.vault.rename(node.file, `${parentPath}/${newName}`);
    await this.refresh();
  }

  private async refresh() {
    await this.buildTree();
    this.render();
  }
}

/* ——— Simple Prompt & Confirm Modals ——— */

class TextPromptModal extends Modal {
  private result = "";

  constructor(app: App, private title: string, private initial = "") {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });

    const input = contentEl.createEl("input", { type: "text" });
    input.value = this.initial;
    input.style.width = "100%";
    input.focus();

    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        this.result = input.value;
        this.close();
      }
    };

    const submit = contentEl.createEl("button", { text: "OK" });
    submit.onclick = () => {
      this.result = input.value;
      this.close();
    };
  }

  openAndGetValue(): Promise<string> {
    return new Promise((resolve) => {
      this.onClose = () => {
        super.onClose();
        resolve(this.result);
      };
      this.open();
    });
  }
}

class ConfirmationModal extends Modal {
  private result = false;

  constructor(app: App, private message: string) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.message });

    const yes = contentEl.createEl("button", { text: "Yes" });
    const no = contentEl.createEl("button", { text: "No" });

    yes.onclick = () => {
      this.result = true;
      this.close();
    };
    no.onclick = () => {
      this.result = false;
      this.close();
    };
  }

  openAndGetValue(): Promise<boolean> {
    return new Promise((resolve) => {
      this.onClose = () => {
        super.onClose();
        resolve(this.result);
      };
      this.open();
    });
  }
}