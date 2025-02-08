/**
 * jocarsa-floralwhite - A minimal library for creating interactive Sankey diagrams with SVG
 * 
 * Author: Your Name
 * License: MIT (or as you prefer)
 */

(function (global) {
  const JocarsaFloralwhite = {};

  /**
   * Create a Sankey chart.
   * @param {Object} config - Configuration for the sankey chart
   * @param {string|HTMLElement} config.element - Selector or DOM element in which to create the chart
   * @param {Object} config.data - The Sankey data: 
   *   {
   *     nodes: [
   *       { name: "Node A", color: "#xxxxxx" },
   *       { name: "Node B", color: "#xxxxxx" },
   *       ...
   *     ],
   *     links: [
   *       { source: "Node A", target: "Node B", value: 10 },
   *       { source: 1, target: 2, value: 15 }, // numeric indices also supported
   *       ...
   *     ]
   *   }
   * @param {number} config.width - The overall width of the chart
   * @param {number} config.height - The overall height of the chart
   * @param {number} [config.nodeWidth=20] - Width of each node rect
   * @param {number} [config.nodePadding=10] - Vertical padding between nodes
   */
  JocarsaFloralwhite.createSankeyChart = function(config) {
    const {
      element,
      data,
      width,
      height,
      nodeWidth = 20,
      nodePadding = 10
    } = config;

    // Resolve container element
    let container;
    if (typeof element === 'string') {
      container = document.querySelector(element);
    } else {
      container = element;
    }
    if (!container) {
      throw new Error("Container element not found");
    }

    // Clear any existing content
    container.innerHTML = '';

    // Create an SVG
    const svg = createSVGElement('svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.classList.add('jocarsa-floralwhite-svg');
    container.appendChild(svg);

    // Create <defs> for gradients
    const defs = createSVGElement('defs');
    svg.appendChild(defs);

    // Prepare nodes
    const nodes = data.nodes.map((d, i) => {
      return { 
        index: i,
        name: d.name || `Node ${i}`,
        color: d.color || getRandomColor(),
      };
    });

    // Build a lookup from node name to index
    const nameToIndex = {};
    nodes.forEach((node, i) => {
      nameToIndex[node.name] = i;
    });

    // Prepare links, mapping "source"/"target" from names to indices if needed
    const links = data.links.map(link => {
      let sourceIndex, targetIndex;

      // Convert source if it's a string
      if (typeof link.source === 'string') {
        sourceIndex = nameToIndex[link.source];
        if (sourceIndex === undefined) {
          throw new Error(`Source node "${link.source}" not found in nodes array`);
        }
      } else {
        sourceIndex = link.source; // assume it's already a number
      }

      // Convert target if it's a string
      if (typeof link.target === 'string') {
        targetIndex = nameToIndex[link.target];
        if (targetIndex === undefined) {
          throw new Error(`Target node "${link.target}" not found in nodes array`);
        }
      } else {
        targetIndex = link.target; // assume it's already a number
      }

      return {
        source: sourceIndex,
        target: targetIndex,
        value: +link.value
      };
    });

    // Build adjacency info and compute in/out flows
    nodes.forEach(n => {
      n.sourceLinks = [];
      n.targetLinks = [];
      n.valueIn = 0;
      n.valueOut = 0;
      n.linkOffsetOut = 0; // Initialize outgoing link offset
      n.linkOffsetIn = 0;  // Initialize incoming link offset
    });

    links.forEach(link => {
      const s = nodes[link.source];
      const t = nodes[link.target];
      s.sourceLinks.push(link);
      t.targetLinks.push(link);
      s.valueOut += link.value;
      t.valueIn += link.value;
    });

    // 1) Assign each node a "column" (x-position) in a simplistic manner
    const sourceNodes = nodes.filter(n => n.valueIn === 0);
    assignNodeLayers(nodes, sourceNodes);

    // 2) Determine total number of layers
    const maxLayer = Math.max(...nodes.map(d => d.layer));
    const layerCount = maxLayer + 1;

    // 3) Compute each node’s x-position in pixels
    const xScale = (width - nodeWidth) / maxLayer;
    nodes.forEach(n => {
      n.x0 = n.layer * xScale;
      n.x1 = n.x0 + nodeWidth;
    });

    // 4) Within each layer, distribute nodes vertically.
    const layers = [];
    for (let i = 0; i <= maxLayer; i++) {
      layers[i] = [];
    }
    nodes.forEach(n => {
      layers[n.layer].push(n);
    });
    layers.forEach(layerNodes => {
      // Sort them in some manner if needed
      layerNodes.sort((a, b) => b.valueOut - a.valueOut);
      distributeLayerNodes(layerNodes, height, nodePadding);
    });

    // 5) Create Link <path> elements in SVG
    links.forEach((link, idx) => {
      const source = nodes[link.source];
      const target = nodes[link.target];

      // Scale link widths so total matches node's height
      const linkWidthScale = (source.y1 - source.y0 - (source.sourceLinks.length - 1) * nodePadding) /
                             source.sourceLinks.reduce((sum, l) => sum + l.value, 0);

      const linkHeight = link.value * linkWidthScale;

      // Assign sy0 and ty0
      const sy0 = source.y0 + source.linkOffsetOut + linkHeight / 2;
      source.linkOffsetOut += linkHeight + nodePadding;

      const ty0 = target.y0 + target.linkOffsetIn + linkHeight / 2;
      target.linkOffsetIn += linkHeight + nodePadding;

      // Create gradient if source and target have different colors
      let linkStroke;
      if (source.color === target.color) {
        linkStroke = source.color;
      } else {
        const gradientId = `gradient-${source.index}-${target.index}-${idx}`;
        const linearGradient = createSVGElement('linearGradient');
        linearGradient.setAttribute('id', gradientId);
        linearGradient.setAttribute('x1', '0%');
        linearGradient.setAttribute('y1', '0%');
        linearGradient.setAttribute('x2', '100%');
        linearGradient.setAttribute('y2', '0%');

        const stop1 = createSVGElement('stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', source.color);
        linearGradient.appendChild(stop1);

        const stop2 = createSVGElement('stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', target.color);
        linearGradient.appendChild(stop2);

        defs.appendChild(linearGradient);

        linkStroke = `url(#${gradientId})`;
      }

      // Build path
      const path = createSVGElement('path');
      path.setAttribute('class', 'jocarsa-floralwhite-link');
      path.setAttribute('d', sankeyLinkPath(
        source.x1, sy0,
        target.x0, ty0
      ));
      path.setAttribute('stroke', linkStroke);
      path.setAttribute('stroke-width', linkHeight);
      path.setAttribute('fill', 'none');

      // Hover interaction
      path.addEventListener('mouseover', () => {
        path.style.strokeOpacity = 0.7;  // or 1 if you want to remove fade
      });
      path.addEventListener('mouseout', () => {
        path.style.strokeOpacity = 0.2;  // revert to a lower opacity
      });

      // Optional: display tooltip or log info
      path.addEventListener('click', () => {
        alert(`Link: ${source.name} -> ${target.name}\nValue: ${link.value}`);
      });

      svg.appendChild(path);
    });

    // 6) Create Node <g> elements
    nodes.forEach(node => {
      const g = createSVGElement('g');
      g.setAttribute('class', 'jocarsa-floralwhite-node');

      const rect = createSVGElement('rect');
      rect.setAttribute('x', node.x0);
      rect.setAttribute('y', node.y0);
      rect.setAttribute('width', nodeWidth);
      rect.setAttribute('height', node.y1 - node.y0);
      rect.setAttribute('fill', node.color);
      rect.setAttribute('stroke', '#ffffff');
      rect.setAttribute('rx', 5);
      rect.setAttribute('ry', 5);
      rect.setAttribute('stroke-width', 2);
      rect.classList.add('jocarsa-floralwhite-rect');

      // Hover changes fill to orange
      rect.addEventListener('mouseover', () => {
        rect.style.fill = 'orange';
      });
      rect.addEventListener('mouseout', () => {
        rect.style.fill = node.color;
      });

      g.appendChild(rect);

      // Node label
      const text = createSVGElement('text');
      text.setAttribute('x', node.x0 + nodeWidth / 2);
      text.setAttribute('y', node.y0 + (node.y1 - node.y0) / 2);
      text.setAttribute('dy', '0.35em');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = node.name;
      text.classList.add('jocarsa-floralwhite-text');
      g.appendChild(text);

      // Optional: show info on click
      rect.addEventListener('click', () => {
        alert(`Node: ${node.name}\nIn: ${node.valueIn}\nOut: ${node.valueOut}`);
      });

      svg.appendChild(g);
    });
  };

  // -------------------------------------------------------------------------
  // Helper functions
  // -------------------------------------------------------------------------

  function assignNodeLayers(nodes, sourceNodes) {
    nodes.forEach(n => n.layer = undefined);

    const queue = [];
    sourceNodes.forEach(s => {
      s.layer = 0;
      queue.push(s);
    });

    while (queue.length) {
      const current = queue.shift();
      const currentLayer = current.layer;
      current.sourceLinks.forEach(link => {
        const targetNode = nodes[link.target];
        if (targetNode.layer == null || targetNode.layer < currentLayer + 1) {
          targetNode.layer = currentLayer + 1;
          queue.push(targetNode);
        }
      });
    }
  }

  function distributeLayerNodes(layerNodes, totalHeight, nodePadding) {
    if (!layerNodes.length) return;
    const totalValue = layerNodes.reduce((sum, n) => sum + Math.max(n.valueIn, n.valueOut), 0);
    let yStart = 0;

    layerNodes.forEach(n => {
      const nodeValue = Math.max(n.valueIn, n.valueOut);
      const nodeHeight = (nodeValue / totalValue) * (totalHeight - nodePadding * (layerNodes.length - 1));
      n.y0 = yStart;
      n.y1 = yStart + nodeHeight;
      yStart += nodeHeight + nodePadding;
    });
  }

  function sankeyLinkPath(x0, y0, x1, y1) {
    const curvature = 0.5;
    const xi = d3InterpolateNumber(x0, x1);
    const x2 = xi(curvature);
    const x3 = xi(1 - curvature);
    return `M${x0},${y0} C${x2},${y0} ${x3},${y1} ${x1},${y1}`;
  }

  function d3InterpolateNumber(a, b) {
    return function(t) {
      return a + (b - a) * t;
    };
  }

  function createSVGElement(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
  }

  function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = JocarsaFloralwhite;
  } else {
    global.jocarsaFloralwhite = JocarsaFloralwhite;
  }

})(this);

