// src/foodImages.js - Automatic food image matching and fallbacks

const IMAGE_URLS = {
  vegetables: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1000&q=85",
  fruits:     "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=1000&q=85",
  cooked:     "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1000&q=85",
  bakery:     "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1000&q=85",
  dairy:      "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=1000&q=85",
  sweets:     "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=1000&q=85",
  grains:     "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1000&q=85",
  generic:    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1000&q=85"
};

const IMAGE_LABELS = {
  vegetables: "Fresh Vegetables",
  fruits:     "Fresh Fruits",
  cooked:     "Cooked Meals",
  bakery:     "Bakery & Bread",
  dairy:      "Milk & Dairy",
  sweets:     "Sweets & Desserts",
  grains:     "Grains & Groceries",
  generic:    "Fresh Nourishing Food"
};

const PATTERNS = [
  // 1. Prepared / cooked dishes (takes priority over vegetable ingredients inside cooked dish)
  [
    "cooked",
    /\b(biryani|pulao|pulav|fried rice|sambar|curry|curries|pasta|noodle|noodles|roti|rotis|chapati|chapatis|naan|paratha|parathas|khichdi|soup|thali|dosa|idli|stew|cooked meal|cooked meals|cooked food|cooked rice|steamed rice|lunch|dinner|breakfast|casserole)\b/i
  ],
  // 2. Fresh fruits
  [
    "fruits",
    /\b(fruit|fruits|apple|apples|banana|bananas|mango|mangoes|orange|oranges|grape|grapes|berry|berries|watermelon|papaya|guava|pineapple|pear|strawberry|peach|lemon|citrus)\b/i
  ],
  // 3. Fresh vegetables
  [
    "vegetables",
    /\b(vegetable|vegetables|veggie|veggies|greens|spinach|tomato|tomatoes|potato|potatoes|carrot|carrots|beans|cabbage|cauliflower|broccoli|cucumber|cucumbers|onion|onions|capsicum|pepper|peppers|peas|salad|leafy|radish|beetroot|pumpkin)\b/i
  ],
  // 4. Bakery & bread
  [
    "bakery",
    /\b(bread|bun|buns|bakery|cake|cakes|pastry|pastries|muffin|muffins|croissant|croissants|bagel|bagels|loaf|loaves|cookies|cookie|toast|biscuit|biscuits|pancake|pancakes|waffle|waffles|sandwich)\b/i
  ],
  // 5. Milk & dairy
  [
    "dairy",
    /\b(milk|dairy|cheese|yogurt|yoghurt|curd|paneer|butter|cream|buttermilk|ghee|lassi)\b/i
  ],
  // 6. Sweets & Desserts
  [
    "sweets",
    /\b(mithai|laddu|ladoo|gulab|jamun|halwa|kheer|barfi|dessert|desserts|pudding|ice cream|chocolate|sweets)\b/i
  ],
  // 7. Grains & Groceries
  [
    "grains",
    /\b(grain|grains|pulse|pulses|raw dal|lentil|lentils|flour|atta|raw wheat|raw rice|cereal|provisions|dry ration)\b/i
  ],
  // 8. General meal words
  [
    "cooked",
    /\b(rice|dal|gravy|meal|meals)\b/i
  ]
];

export function selectFoodImage(description = "", category = "") {
  const desc = (description || "").trim();
  const cat = (category || "").trim();

  // 1. Check description against regex patterns
  if (desc) {
    for (const [key, pattern] of PATTERNS) {
      if (pattern.test(desc)) {
        return { url: IMAGE_URLS[key], label: IMAGE_LABELS[key], key };
      }
    }
  }

  // 2. Check category
  if (cat) {
    const catLower = cat.toLowerCase();
    if (catLower.includes("cooked")) return { url: IMAGE_URLS.cooked, label: IMAGE_LABELS.cooked, key: "cooked" };
    if (catLower.includes("bake") || catLower.includes("bread")) return { url: IMAGE_URLS.bakery, label: IMAGE_LABELS.bakery, key: "bakery" };
    if (catLower.includes("dairy") || catLower.includes("milk")) return { url: IMAGE_URLS.dairy, label: IMAGE_LABELS.dairy, key: "dairy" };
    if (catLower.includes("sweet") || catLower.includes("dessert")) return { url: IMAGE_URLS.sweets, label: IMAGE_LABELS.sweets, key: "sweets" };
    if (catLower.includes("fruit")) return { url: IMAGE_URLS.fruits, label: IMAGE_LABELS.fruits, key: "fruits" };
    if (catLower.includes("veg")) return { url: IMAGE_URLS.vegetables, label: IMAGE_LABELS.vegetables, key: "vegetables" };
    if (catLower.includes("pack") || catLower.includes("raw") || catLower.includes("grain")) return { url: IMAGE_URLS.grains, label: IMAGE_LABELS.grains, key: "grains" };
  }

  // 3. Fallback for unknown / generic food names
  return { url: IMAGE_URLS.generic, label: IMAGE_LABELS.generic, key: "generic" };
}

export function getFoodImageFallback(description = "", category = "") {
  const { label } = selectFoodImage(description, category);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%">
    <defs>
      <linearGradient id="warmBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F7F0E2"/>
        <stop offset="60%" stop-color="#EBE2CF"/>
        <stop offset="100%" stop-color="#DFD3BA"/>
      </linearGradient>
    </defs>
    <rect width="800" height="480" fill="url(#warmBg)"/>
    <circle cx="400" cy="200" r="105" fill="#FFFCF6" opacity="0.9" stroke="#E4D8C3" stroke-width="2"/>
    <text x="400" y="225" text-anchor="middle" font-size="95">🌿</text>
    <text x="400" y="360" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="700" font-size="30" fill="#79502F">${label}</text>
    <text x="400" y="398" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="500" font-size="16" fill="#777467">ZeroHunger Community Share</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
