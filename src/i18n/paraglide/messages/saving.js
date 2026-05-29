/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} SavingInputs */

const uk_saving = /** @type {(inputs: SavingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Збереження…`)
};

const en_saving = /** @type {(inputs: SavingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Saving…`)
};

/**
* | output |
* | --- |
* | "Saving…" |
*
* @param {SavingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const saving = /** @type {((inputs?: SavingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<SavingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_saving(inputs)
	return en_saving(inputs)
});