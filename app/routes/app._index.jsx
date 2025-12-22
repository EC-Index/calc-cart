import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const response = await admin.graphql(`
    {
      products(first: 50) {
        nodes {
          id
          title
          featuredImage {
            url
          }
        }
      }
    }
  `);

  const { data } = await response.json();
  const products = data.products.nodes;

  const calculators = await prisma.productCalculator.findMany({
    where: { shop },
  });

  return { products, calculators, shop };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "create") {
    const productId = formData.get("productId");
    const productTitle = formData.get("productTitle");
    const unitType = formData.get("unitType");
    const unitLabel = formData.get("unitLabel");
    const coverage = parseFloat(formData.get("coverage")) || 0;
    const coverageUnit = formData.get("coverageUnit");
    const wasteFactor = parseFloat(formData.get("wasteFactor")) || 1.1;

    await prisma.productCalculator.upsert({
      where: { shop_productId: { shop, productId } },
      update: {
        productTitle,
        unitType,
        unitLabel,
        coverage,
        coverageUnit,
        wasteFactor,
        isActive: true,
      },
      create: {
        shop,
        productId,
        productTitle,
        unitType,
        unitLabel,
        coverage,
        coverageUnit,
        wasteFactor,
      },
    });

    return { success: true, message: "Calculator saved!" };
  }

  if (actionType === "delete") {
    const id = formData.get("id");
    await prisma.productCalculator.delete({ where: { id } });
    return { success: true, message: "Calculator deleted!" };
  }

  return { success: false };
};

export default function Index() {
  const { products, calculators } = useLoaderData();
  const fetcher = useFetcher();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    unitType: "area_metric",
    unitLabel: "sqm",
    coverage: "",
    coverageUnit: "sqm/Liter",
    wasteFactor: "1.1",
  });

  const unitOptions = [
    { value: "area_metric", label: "Area (sqm)", unit: "sqm", coverageUnit: "sqm/Liter" },
    { value: "area_imperial", label: "Area (sq ft)", unit: "sq ft", coverageUnit: "sq ft/Gallon" },
    { value: "length_metric", label: "Length (m)", unit: "m", coverageUnit: "m/Roll" },
    { value: "length_imperial", label: "Length (ft)", unit: "ft", coverageUnit: "ft/Roll" },
    { value: "volume_metric", label: "Volume (L)", unit: "L", coverageUnit: "L/kg" },
    { value: "volume_imperial", label: "Volume (Gallon)", unit: "gal", coverageUnit: "gal/lb" },
    { value: "pieces", label: "Pieces", unit: "pcs", coverageUnit: "pcs/Pack" },
  ];

  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setShowForm(true);
    const existing = calculators.find(c => c.productId === product.id);
    if (existing) {
      setFormData({
        unitType: existing.unitType,
        unitLabel: existing.unitLabel,
        coverage: existing.coverage.toString(),
        coverageUnit: existing.coverageUnit,
        wasteFactor: existing.wasteFactor.toString(),
      });
    } else {
      setFormData({
        unitType: "area_metric",
        unitLabel: "sqm",
        coverage: "",
        coverageUnit: "sqm/Liter",
        wasteFactor: "1.1",
      });
    }
  };

  const handleUnitTypeChange = (value) => {
    const option = unitOptions.find(o => o.value === value);
    setFormData({
      ...formData,
      unitType: value,
      unitLabel: option.unit,
      coverageUnit: option.coverageUnit,
    });
  };

  const handleSubmit = () => {
    fetcher.submit(
      {
        action: "create",
        productId: selectedProduct.id,
        productTitle: selectedProduct.title,
        ...formData,
      },
      { method: "POST" }
    );
    setShowForm(false);
    setSelectedProduct(null);
  };

  const handleDelete = (id) => {
    fetcher.submit({ action: "delete", id }, { method: "POST" });
  };

  const getConfiguredProductIds = () => calculators.map(c => c.productId);

  return (
    <s-page heading="CalcCart - Material Calculator">
      <s-button slot="primary-action" onClick={() => window.location.reload()}>
        Refresh
      </s-button>

      <s-section heading={`Active Calculators (${calculators.length})`}>
        {calculators.length === 0 ? (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text>No calculators configured yet. Select a product below to get started!</s-text>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {calculators.map((calc) => (
              <s-box key={calc.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" gap="base" align="space-between">
                  <s-stack direction="block" gap="tight">
                    <s-text fontWeight="bold">{calc.productTitle}</s-text>
                    <s-text tone="subdued">
                      1 unit covers {calc.coverage} {calc.unitLabel} | Waste: {((calc.wasteFactor - 1) * 100).toFixed(0)}%
                    </s-text>
                  </s-stack>
                  <s-stack direction="inline" gap="tight">
                    <s-button variant="secondary" onClick={() => handleProductSelect({ id: calc.productId, title: calc.productTitle })}>
                      Edit
                    </s-button>
                    <s-button variant="destructive" onClick={() => handleDelete(calc.id)}>
                      Delete
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      {!showForm && (
        <s-section heading="Add Calculator to Product">
          <s-stack direction="block" gap="base">
            {products.map((product) => {
              const isConfigured = getConfiguredProductIds().includes(product.id);
              return (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={isConfigured ? "success-subdued" : "default"}
                >
                  <s-stack direction="inline" gap="base" align="space-between">
                    <s-stack direction="inline" gap="base">
                      {product.featuredImage?.url && (
                        <img
                          src={product.featuredImage.url}
                          alt={product.title}
                          style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 4 }}
                        />
                      )}
                      <s-stack direction="block" gap="tight">
                        <s-text fontWeight="bold">{product.title}</s-text>
                        {isConfigured && <s-text tone="success">Calculator active</s-text>}
                      </s-stack>
                    </s-stack>
                    <s-button onClick={() => handleProductSelect(product)}>
                      {isConfigured ? "Edit" : "Add Calculator"}
                    </s-button>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        </s-section>
      )}

      {showForm && selectedProduct && (
        <s-section heading={`Configure: ${selectedProduct.title}`}>
          <s-box padding="loose" borderWidth="base" borderRadius="large">
            <s-stack direction="block" gap="loose">

              <s-stack direction="block" gap="tight">
                <s-text fontWeight="bold">Unit Type</s-text>
                <select
                  value={formData.unitType}
                  onChange={(e) => handleUnitTypeChange(e.target.value)}
                  style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ccc", width: "100%" }}
                >
                  {unitOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </s-stack>

              <s-stack direction="block" gap="tight">
                <s-text fontWeight="bold">Coverage (1 unit covers how much?)</s-text>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 6 (for 6 sqm per Liter)"
                  value={formData.coverage}
                  onChange={(e) => setFormData({ ...formData, coverage: e.target.value })}
                  style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ccc", width: "100%" }}
                />
                <s-text tone="subdued">Example: 1 Liter of paint covers 6 sqm - enter 6</s-text>
              </s-stack>

              <s-stack direction="block" gap="tight">
                <s-text fontWeight="bold">Waste Factor</s-text>
                <select
                  value={formData.wasteFactor}
                  onChange={(e) => setFormData({ ...formData, wasteFactor: e.target.value })}
                  style={{ padding: "10px", borderRadius: "6px", border: "1px solid #ccc", width: "100%" }}
                >
                  <option value="1.0">0% (No waste)</option>
                  <option value="1.05">5%</option>
                  <option value="1.1">10% (Recommended)</option>
                  <option value="1.15">15%</option>
                  <option value="1.2">20%</option>
                </select>
              </s-stack>

              <s-stack direction="inline" gap="base">
                <s-button variant="primary" onClick={handleSubmit}>
                  Save Calculator
                </s-button>
                <s-button variant="secondary" onClick={() => { setShowForm(false); setSelectedProduct(null); }}>
                  Cancel
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>
      )}

      <s-section slot="aside" heading="How It Works">
        <s-box padding="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-text>1. Select a product</s-text>
            <s-text>2. Enter coverage (e.g. 6 sqm/Liter)</s-text>
            <s-text>3. Set waste factor</s-text>
            <s-text>4. Widget appears on product page</s-text>
          </s-stack>
        </s-box>
      </s-section>

      <s-section slot="aside" heading="Coming Soon">
        <s-box padding="base" borderRadius="base" background="info-subdued">
          <s-stack direction="block" gap="tight">
            <s-text fontWeight="bold">AI Magic Setup</s-text>
            <s-text tone="subdued">Upload a product datasheet and let AI extract the coverage automatically!</s-text>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
```

Speichern (als UTF-8!), dann:
```
