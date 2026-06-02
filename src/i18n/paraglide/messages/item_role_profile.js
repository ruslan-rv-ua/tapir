/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Item_Role_ProfileInputs */

const uk_item_role_profile = /** @type {(inputs: Item_Role_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`профіль`)
};

const en_item_role_profile = /** @type {(inputs: Item_Role_ProfileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`profile`)
};

/**
* | output |
* | --- |
* | "profile" |
*
* @param {Item_Role_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const item_role_profile = /** @type {((inputs?: Item_Role_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Item_Role_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_item_role_profile(inputs)
	return en_item_role_profile(inputs)
});