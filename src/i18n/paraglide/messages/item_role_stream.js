/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Item_Role_StreamInputs */

const uk_item_role_stream = /** @type {(inputs: Item_Role_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`потік`)
};

const en_item_role_stream = /** @type {(inputs: Item_Role_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`stream`)
};

/**
* | output |
* | --- |
* | "stream" |
*
* @param {Item_Role_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const item_role_stream = /** @type {((inputs?: Item_Role_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Item_Role_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_item_role_stream(inputs)
	return en_item_role_stream(inputs)
});