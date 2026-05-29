/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Item_Role_PatternInputs */

const uk_item_role_pattern = /** @type {(inputs: Item_Role_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`патерн`)
};

const en_item_role_pattern = /** @type {(inputs: Item_Role_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`pattern`)
};

/**
* | output |
* | --- |
* | "pattern" |
*
* @param {Item_Role_PatternInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const item_role_pattern = /** @type {((inputs?: Item_Role_PatternInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Item_Role_PatternInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_item_role_pattern(inputs)
	return en_item_role_pattern(inputs)
});