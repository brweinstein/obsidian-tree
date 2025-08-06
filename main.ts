import { Plugin, WorkspaceLeaf, MarkdownView } from "obsidian";
import { TreeView, VIEW_TYPE_TREE } from "./tree-view";

export default class TreeNavigatorPlugin extends Plugin {
  private lastLeaf: WorkspaceLeaf | null = null;

  onload() {
    // 1) Register TreeView with injected toggle callback
    this.registerView(
      VIEW_TYPE_TREE,
      (leaf) => new TreeView(leaf, () => this.activateView())
    );

    // 2) Ribbon icon to toggle
    this.addRibbonIcon(
      "folder",
      "Tree Navigator: Toggle Tree Navigator",
      () => this.activateView()
    );

    // 3) Single command + hotkey (Alt+N by default)
    this.addCommand({
      id: "toggle-tree-navigator",
      name: "Tree Navigator: Toggle Tree Navigator",
      hotkeys: [{ modifiers: ["Alt"], key: "n" }],
      callback: () => this.activateView(),
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TREE);
  }

  public async activateView() {
    // A) If TreeView is active, go back to the lastLeaf
    const inTree = this.app.workspace.getActiveViewOfType(TreeView);
    if (inTree && this.lastLeaf) {
      this.app.workspace.setActiveLeaf(this.lastLeaf);
      return;
    }

    // B) If editing Markdown, record that leaf
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (mdView) {
      const viewType = mdView.getViewType();
      const mdLeaf = this.app.workspace
        .getLeavesOfType(viewType)
        .find((l) => l.view === mdView) ?? null;
      if (mdLeaf) {
        this.lastLeaf = mdLeaf;
      }
    }

    // C) Find or create the TreeView leaf
    let treeLeaf: WorkspaceLeaf;
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TREE);
    if (existing.length > 0) {
      treeLeaf = existing[0];
    } else {
      const left = this.app.workspace.getLeftLeaf(false);
      treeLeaf = left !== null ? left : this.app.workspace.getLeaf("split");
    }

    // D) Reveal & activate the TreeView
    await treeLeaf.setViewState({ type: VIEW_TYPE_TREE, active: true });
    this.app.workspace.revealLeaf(treeLeaf);

    // E) Autofocus the tree container + first item
    const view = treeLeaf.view;
    if (view instanceof TreeView) {
      view.focusContainer();
      view.focusFirstItem();
    }
  }
}