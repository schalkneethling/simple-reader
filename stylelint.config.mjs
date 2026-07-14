import cssPropertyTypeValidator from "@schalkneethling/stylelint-plugin-css-property-type-validator";

/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["coverage/**", "dist/**", "dist-web/**", "node_modules/**"],
  plugins: ["stylelint-order", "stylelint-plugin-use-baseline", cssPropertyTypeValidator],
  rules: {
    "order/properties-alphabetical-order": true,
    "plugin/use-baseline": true,
    "css-property-type-validator/valid-property-types": true,
  },
};
