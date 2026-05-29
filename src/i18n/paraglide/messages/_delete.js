/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} _DeleteInputs */

const uk__delete = /** @type {(inputs: _DeleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Видалити`)
};

const en__delete = /** @type {(inputs: _DeleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Delete`)
};

/**
* | output |
* | --- |
* | "Delete" |
*
* @param {_DeleteInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
const _delete = /** @type {((inputs?: _DeleteInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<_DeleteInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk__delete(inputs)
	return en__delete(inputs)
});
export { _delete as "delete" }